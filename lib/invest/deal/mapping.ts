/**
 * lib/invest/deal/mapping.ts — ② Deal & Offering : LE mapping central DB → moteur.
 *
 * `mapDbDealToInput(deal, tranche, spv)` transforme les colonnes RÉELLES de
 * `inv_deals` (+ `inv_bond_tranches` + `inv_spvs`, migration 0016) en un
 * `DealInput` du moteur financier PUR (`lib/invest/finance`). Le moteur reste
 * intact : on ne fait que CÂBLER les colonnes existantes vers son contrat.
 *
 * Principe : aucune colonne inventée. Quand un champ `DealInput` n'a PAS de
 * colonne dédiée, on le lit dans un jsonb existant (`inv_deals.scenarios`,
 * `inv_deals.fees`, `inv_deals.waterfall`) ou on applique un défaut RAISONNABLE
 * documenté (jamais une promesse de rendement — distribution variable, P6).
 *
 * Mapping des CHECK DB → enums moteur :
 *   - inv_deals.deal_type ∈ {marchand_de_biens, promotion, locatif, value_add, mixte}
 *     → OperationType ∈ {marchand_de_biens, promotion, locatif}. value_add/mixte
 *       retombent sur 'marchand_de_biens' (profil cashflow le plus proche : gain
 *       in fine sur revente). Documenté, conservateur.
 *
 * PUR : aucune I/O, aucun réseau. Testable seul.
 */

import type {
  DealInput,
  OperationType,
  ScenarioSet,
  DealFees,
} from "../finance/types";

// ─── Rows DB (sous-ensembles utiles, alignés database.types.ts / migration 0016) ─

/** Sous-ensemble de `inv_deals` nécessaire au mapping moteur. */
export interface DbDealRow {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  deal_type: string;
  city: string | null;
  postal_code: string | null;
  country: string;
  acquisition_price_eur: number | null;
  notary_fees_eur: number | null;
  works_budget_eur: number | null;
  other_costs_eur: number | null;
  total_project_cost_eur: number | null;
  senior_debt_eur: number | null;
  sponsor_equity_eur: number | null;
  appraised_value_eur: number | null;
  target_irr_pct: number | null;
  duration_months: number | null;
  target_raise_eur: number;
  min_ticket_eur: number;
  max_ticket_eur: number | null;
  opens_at: string | null;
  closes_at: string | null;
  /** jsonb : décalages de scénario pess/central/opt (P8). */
  scenarios: unknown;
  /** jsonb : grille de frais plateforme + opérateur (P7). */
  fees: unknown;
  /** jsonb : ordre du waterfall (documenté, non requis par le moteur). */
  waterfall: unknown;
}

/** Sous-ensemble de `inv_bond_tranches` (taux de coupon + nominal). */
export interface DbTrancheRow {
  coupon_rate_pct: number | null;
  total_nominal_eur: number;
  nominal_unit_eur: number;
}

/** Sous-ensemble de `inv_spvs` (taux de la dette senior). */
export interface DbSpvRow {
  senior_debt_amount_eur: number | null;
  /** Pas de colonne dédiée au TAUX senior dans 0016 → lu via jsonb deal.fees. */
}

// ─── Défauts documentés (jamais des promesses ; cadrent le moteur si DB muette) ─

/**
 * Taux senior par défaut si absent du jsonb `fees` (4,5 %/an — cohérent avec la
 * fixture RESIDENCE_HAUSSMANN et un crédit hypothécaire 1er rang).
 */
export const DEFAULT_SENIOR_RATE = 0.045;

/** Grille de frais par défaut (P7) si `inv_deals.fees` est vide/incomplet. */
export const DEFAULT_FEES: DealFees = {
  frais_plateforme_entree_pct: 0.01,
  frais_plateforme_admin_annuel_pct: 0.005,
  frais_operateur_acquisition_pct: 0.02,
  carried_operateur_pct: 0.2,
  hurdle_annuel: 0.08,
};

/**
 * Décalages de scénario par défaut (P7) si `inv_deals.scenarios` est vide :
 * pessimiste = revente -8 % + 3 mois de retard ; central = (0,0) ; optimiste = +5 %.
 */
export const DEFAULT_SCENARIOS: ScenarioSet = {
  pessimiste: { delta_prix_revente_pct: -0.08, retard_mois: 3 },
  central: { delta_prix_revente_pct: 0, retard_mois: 0 },
  optimiste: { delta_prix_revente_pct: 0.05, retard_mois: 0 },
};

/** Durée par défaut (mois) si `duration_months` est null. */
export const DEFAULT_DURATION_MONTHS = 18;

// ─── Helpers de lecture jsonb (tolérants, sans throw) ────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Lit un ScenarioShift depuis un jsonb { delta_prix_revente_pct, retard_mois }. */
function readShift(
  v: unknown,
  fallback: { delta_prix_revente_pct: number; retard_mois: number },
): { delta_prix_revente_pct: number; retard_mois: number } {
  const r = asRecord(v);
  if (!r) return fallback;
  return {
    delta_prix_revente_pct: num(r.delta_prix_revente_pct) ?? fallback.delta_prix_revente_pct,
    retard_mois: num(r.retard_mois) ?? fallback.retard_mois,
  };
}

/** Construit le jeu de 3 scénarios depuis `inv_deals.scenarios` (jsonb) + défauts. */
export function readScenarios(jsonb: unknown): ScenarioSet {
  const r = asRecord(jsonb);
  if (!r) return DEFAULT_SCENARIOS;
  return {
    pessimiste: readShift(r.pessimiste, DEFAULT_SCENARIOS.pessimiste),
    central: readShift(r.central, DEFAULT_SCENARIOS.central),
    optimiste: readShift(r.optimiste, DEFAULT_SCENARIOS.optimiste),
  };
}

/** Construit la grille de frais depuis `inv_deals.fees` (jsonb) + défauts. */
export function readFees(jsonb: unknown): DealFees {
  const r = asRecord(jsonb);
  if (!r) return DEFAULT_FEES;
  return {
    frais_plateforme_entree_pct:
      num(r.frais_plateforme_entree_pct) ?? DEFAULT_FEES.frais_plateforme_entree_pct,
    frais_plateforme_admin_annuel_pct:
      num(r.frais_plateforme_admin_annuel_pct) ?? DEFAULT_FEES.frais_plateforme_admin_annuel_pct,
    frais_operateur_acquisition_pct:
      num(r.frais_operateur_acquisition_pct) ?? DEFAULT_FEES.frais_operateur_acquisition_pct,
    carried_operateur_pct: num(r.carried_operateur_pct) ?? DEFAULT_FEES.carried_operateur_pct,
    hurdle_annuel: num(r.hurdle_annuel) ?? DEFAULT_FEES.hurdle_annuel,
  };
}

/** Lit le taux senior depuis `inv_deals.fees.taux_dette_senior_annuel` (jsonb) ou défaut. */
export function readSeniorRate(feesJsonb: unknown): number {
  const r = asRecord(feesJsonb);
  return (r && num(r.taux_dette_senior_annuel)) ?? DEFAULT_SENIOR_RATE;
}

/**
 * Lit le prix de revente central + valeur d'expertise + loyer depuis le jsonb
 * `inv_deals.scenarios.exit` si présent (colonne dédiée absente en 0016). Sinon
 * on dérive un prix de revente conservateur du coût total + marge implicite.
 */
function readExit(
  scenariosJsonb: unknown,
  coutTotal: number,
  appraised: number | null,
  loyerAnnuel: number | null,
): { prix_revente_central_eur: number; valeur_expertise_eur?: number; loyer_net_annuel_eur?: number } {
  const r = asRecord(scenariosJsonb);
  const exit = r ? asRecord(r.exit) : null;
  const prixExplicite = exit ? num(exit.prix_revente_central_eur) : null;
  // Défaut conservateur : revente = coût total (marge 0) si rien n'est fourni.
  // Le moteur signalera alors une marge fragile (warning), ce qui est honnête.
  const prix = prixExplicite ?? coutTotal;
  const valeur = (exit && num(exit.valeur_expertise_eur)) ?? appraised ?? undefined;
  const loyer = (exit && num(exit.loyer_net_annuel_eur)) ?? loyerAnnuel ?? undefined;
  return {
    prix_revente_central_eur: prix,
    ...(valeur != null ? { valeur_expertise_eur: valeur } : {}),
    ...(loyer != null ? { loyer_net_annuel_eur: loyer } : {}),
  };
}

/** Map le `deal_type` DB (5 valeurs) vers l'`OperationType` moteur (3 valeurs). */
export function mapOperationType(dealType: string): OperationType {
  switch (dealType) {
    case "locatif":
      return "locatif";
    case "promotion":
      return "promotion";
    case "marchand_de_biens":
      return "marchand_de_biens";
    // value_add / mixte → profil de cashflow le plus proche (gain in fine).
    default:
      return "marchand_de_biens";
  }
}

/**
 * MAPPING CENTRAL : colonnes DB → `DealInput` du moteur financier.
 *
 * Colonnes utilisées (toutes RÉELLES, migration 0016) :
 *   costs   ← acquisition_price_eur / notary_fees_eur / works_budget_eur / other_costs_eur
 *   funding ← senior_debt_eur, sponsor_equity_eur, target_raise_eur (= obligations cible),
 *             tranche.coupon_rate_pct (coupon CIBLE non garanti),
 *             fees.taux_dette_senior_annuel (jsonb) | défaut 4,5 %
 *   fees    ← deal.fees (jsonb) | DEFAULT_FEES
 *   exit    ← deal.scenarios.exit (jsonb) | dérivé du coût total ; appraised_value_eur
 *   schedule← duration_months | défaut, opens_at | now
 *   scenarios ← deal.scenarios (jsonb) | DEFAULT_SCENARIOS
 *
 * @param deal    ligne `inv_deals` (sous-ensemble).
 * @param tranche tranche obligataire de référence (coupon + nominal) ou null.
 * @param spv     SPV porteuse (dette senior) ou null.
 */
export function mapDbDealToInput(
  deal: DbDealRow,
  tranche: DbTrancheRow | null,
  spv: DbSpvRow | null,
): DealInput {
  const costs = {
    prix_acquisition_eur: deal.acquisition_price_eur ?? 0,
    frais_notaire_eur: deal.notary_fees_eur ?? 0,
    budget_travaux_eur: deal.works_budget_eur ?? 0,
    frais_divers_portage_eur: deal.other_costs_eur ?? 0,
  };

  // Coût total : colonne dénormalisée si présente, sinon somme des postes.
  const coutTotal =
    deal.total_project_cost_eur ??
    costs.prix_acquisition_eur +
      costs.frais_notaire_eur +
      costs.budget_travaux_eur +
      costs.frais_divers_portage_eur;

  // Obligations cible = montant de la tranche si fournie, sinon target_raise du deal.
  const obligationsCible = tranche?.total_nominal_eur ?? deal.target_raise_eur;

  const funding = {
    dette_senior_eur: deal.senior_debt_eur ?? spv?.senior_debt_amount_eur ?? 0,
    taux_dette_senior_annuel: readSeniorRate(deal.fees),
    equity_sponsor_eur: deal.sponsor_equity_eur ?? 0,
    obligations_cible_eur: obligationsCible,
    // Coupon CIBLE (jamais garanti, P6). % DB → ratio moteur.
    taux_coupon_obligataire_annuel:
      tranche?.coupon_rate_pct != null ? tranche.coupon_rate_pct / 100 : 0,
  };

  const schedule = {
    duree_mois: deal.duration_months ?? DEFAULT_DURATION_MONTHS,
    // t0 du TRI investisseur : ouverture de la levée si connue, sinon aujourd'hui.
    date_closing: (deal.opens_at ?? new Date().toISOString()).slice(0, 10),
  };

  const exit = readExit(deal.scenarios, coutTotal, deal.appraised_value_eur, null);

  return {
    id: deal.slug,
    nom: deal.name,
    localisation: [deal.city, deal.country].filter(Boolean).join(", ") || "Localisation au closing/NDA",
    type_operation: mapOperationType(deal.deal_type),
    costs,
    funding,
    fees: readFees(deal.fees),
    schedule,
    exit,
    scenarios: readScenarios(deal.scenarios),
    ticket_min_eur: deal.min_ticket_eur,
    ticket_max_eur: deal.max_ticket_eur ?? undefined,
    day_count: "ACT_365",
  };
}
