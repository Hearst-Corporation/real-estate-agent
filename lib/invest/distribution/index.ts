/**
 * lib/invest/distribution/index.ts — ⑦ Distribution & Lifecycle : CORE DB-backed (Epic 1.5).
 *
 * Calcule + persiste les DISTRIBUTIONS (coupon / exit) d'un deal :
 *   - le montant au niveau tranche vient du MOTEUR FINANCIER PUR (lib/invest/finance)
 *     — JAMAIS recalculé à la main : waterfall (scénario central) à l'exit, coupon
 *     contractuel cible pour un coupon ;
 *   - la répartition par porteur (`inv_distribution_payouts`) est faite au PRORATA
 *     des units détenues (cap table, source de vérité DEEP) ;
 *   - le règlement EUR est délégué à l'EscrowPort (release/payout) en FAIL-SOFT :
 *     escrow non configuré → payouts `pending`, jamais d'échec dur ;
 *   - IDEMPOTENT par `payout:{dealId}:{kind}:{round}` (un rejeu rejoue la réponse,
 *     ne crée pas de double distribution) ;
 *   - à l'exit, les souscriptions `minted` du deal passent en `redeemed` (terminal).
 *
 * RAPPEL ANTI-FIA (I2/L2) : une distribution est le PAIEMENT D'UNE CRÉANCE
 * (coupon / remboursement de principal), VARIABLE et NON garanti. Jamais un
 * « rendement » servi sur un pool, jamais de NAV/valeur consolidée.
 *
 * Le client service-role BYPASS la RLS → on filtre TOUJOURS `tenant_id` et on
 * `assertTenant` chaque ligne (I9). Store INJECTABLE pour les tests.
 */

import { getSupabaseAdmin } from "../../server/supabase";
import { DEFAULT_TENANT_ID } from "../shared/types";
import { assertTenant, type OwnershipContext } from "../shared/ownership";
import { InvariantViolationError, NotImplementedError } from "../shared/errors";
import { recordAudit } from "../shared/audit";
import { getEscrowPort } from "../adapters";
import type { EscrowPort, EscrowProvider } from "../ports/escrow";
import {
  withIdempotency,
  hashBody,
  supabaseIdempotencyStore,
  type IdempotencyStore,
} from "../shared/idempotency";
import { buildDealSheet } from "../finance/deal-engine";
import { couponObligataireDu } from "../finance/waterfall";
import { mapDbDealToInput, type DbDealRow, type DbTrancheRow, type DbSpvRow } from "../deal/mapping";
import type {
  Distribution,
  DistributionKind,
  DistributionType,
  Payout,
  PayoutShare,
  PayoutStatus,
  RunDistributionResult,
} from "./types";

export * from "./types";

/** Fournisseur de séquestre par défaut (TIERS — jamais la plateforme, I4). */
const DEFAULT_ESCROW_PROVIDER: EscrowProvider = "notaire";

// ─── Contexte d'appel ─────────────────────────────────────────────────────────

/** Contexte de la distribution (acteur déclencheur + tenant). */
export interface DistributionCtx {
  tenantId: string;
  /** uid de l'opérateur déclencheur (audit). */
  actorUserId?: string | null;
}

// ─── Rows DB (sous-ensembles, colonnes RÉELLES 0019/0016/0017) ───────────────

/** Holder agrégé depuis la cap table (dernier solde par porteur sur la tranche). */
export interface HolderPosition {
  holderUserId: string;
  holderProfileId: string;
  bondTrancheId: string;
  /** Solde courant en units (balance_units_after du dernier mouvement). */
  unitsHeld: number;
}

/**
 * Tranche de référence pour le calcul du montant + l'id à persister. On porte
 * explicitement `bondTrancheId` (absent de `DbTrancheRow` du moteur) à côté des
 * champs financiers consommés par `mapDbDealToInput`.
 */
export interface DealTranche extends DbTrancheRow {
  bondTrancheId: string;
}

/** Bundle deal + tranche + SPV alimentant le moteur financier. */
export interface DealBundle {
  deal: DbDealRow;
  tranche: DealTranche | null;
  spv: DbSpvRow | null;
}

/** Insert d'une distribution au niveau tranche (colonnes RÉELLES inv_distributions). */
export interface DistributionInsert {
  deal_id: string;
  bond_tranche_id: string;
  distribution_type: DistributionType;
  gross_amount_eur: number;
  currency: string;
  waterfall_rank: number | null;
  period_start: string | null;
  period_end: string | null;
  record_date: string | null;
  payment_date: string | null;
  status: string;
}

/** Insert d'un payout porteur (colonnes RÉELLES inv_distribution_payouts). */
export interface PayoutInsert {
  distribution_id: string;
  holder_profile_id: string;
  holder_user_id: string;
  bond_tranche_id: string;
  units_held: number;
  gross_amount_eur: number;
  withholding_eur: number;
  net_amount_eur: number;
  currency: string;
  payment_reference: string | null;
  status: string;
}

/** Ligne payout telle que persistée (sous-ensemble + jointure deal). */
export interface PayoutRow {
  id: string;
  tenant_id: string;
  distribution_id: string;
  holder_profile_id: string;
  holder_user_id: string;
  bond_tranche_id: string;
  units_held: number;
  gross_amount_eur: number;
  withholding_eur: number;
  net_amount_eur: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  /** Renseignés par jointure (présentation). */
  deal_id?: string | null;
  deal_name?: string | null;
  distribution_type?: string | null;
}

/** Ligne distribution telle que persistée (sous-ensemble inv_distributions). */
export interface DistributionRow {
  id: string;
  tenant_id: string;
  deal_id: string;
  bond_tranche_id: string;
  distribution_type: string;
  gross_amount_eur: number;
  currency: string;
  waterfall_rank: number | null;
  status: string;
  created_at: string;
}

/**
 * Store injectable de la distribution. Toutes les méthodes sont filtrées
 * `tenant_id` côté implémentation ; le service ré-asserte (I9).
 */
export interface DistributionStore {
  /** Deal + tranche + SPV pour alimenter le moteur financier (waterfall/coupon). Tenant-scopé. */
  findDealBundle(tenantId: string, dealId: string): Promise<DealBundle | null>;
  /** Positions courantes (units par porteur) depuis la cap table (DEEP). Tenant-scopé. */
  listHolderPositions(tenantId: string, dealId: string): Promise<HolderPosition[]>;
  /** Nombre de distributions déjà émises pour (deal, type) — sert au round. Tenant-scopé. */
  countDistributions(tenantId: string, dealId: string, type: DistributionType): Promise<number>;
  /** Crée la distribution (niveau tranche). Renvoie l'id créé. Tenant-scopé. */
  insertDistribution(tenantId: string, row: DistributionInsert): Promise<{ id: string }>;
  /** Crée un payout porteur. Tenant-scopé. */
  insertPayout(tenantId: string, row: PayoutInsert): Promise<{ id: string }>;
  /** Marque une distribution `paid`/`partial`/`planned`. Tenant-scopé. */
  setDistributionStatus(tenantId: string, distributionId: string, status: string): Promise<void>;
  /**
   * Compte les souscriptions `minted` (terminal) du deal à l'exit. `minted` EST
   * l'état terminal de la machine (aucune transition sortante) → on ne réécrit
   * AUCUN statut hors schéma (pas de `redeemed` inexistant côté CHECK 0017) ;
   * on lit seulement le nb de créances éteintes par le versement final. Tenant-scopé.
   */
  countMintedSubscriptions(tenantId: string, dealId: string): Promise<number>;
  /** Payouts reçus par l'utilisateur (présentation portefeuille). Tenant+user-scopé. */
  listPayoutsForUser(tenantId: string, userId: string): Promise<PayoutRow[]>;
  /** Distributions d'un deal (historique, niveau tranche). Tenant-scopé. */
  listDistributionsForDeal(tenantId: string, dealId: string): Promise<DistributionRow[]>;
  /** Écrit une entrée d'audit (fail-soft : ne lève jamais). */
  audit(input: {
    tenantId: string;
    action: string;
    actorUserId?: string | null;
    entityId?: string;
    after?: Record<string, unknown>;
  }): Promise<void>;
}

// ─── PURE : répartition prorata du montant tranche entre porteurs ─────────────

/** Arrondi au centime (numeric(16,2) DB). PUR. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Répartit PUREMENT un montant total (EUR) entre porteurs au PRORATA des units.
 * Le dernier porteur absorbe le résidu d'arrondi (la somme des parts == total au
 * centime). Aucune retenue par défaut (withholding=0 ; net=gross). PUR.
 *
 * @returns parts ordonnées comme l'entrée (units > 0 uniquement).
 */
export function allocateProRata(
  totalEur: number,
  holders: readonly HolderPosition[],
  status: PayoutStatus,
): PayoutShare[] {
  const eligible = holders.filter((h) => h.unitsHeld > 0);
  const totalUnits = eligible.reduce((s, h) => s + h.unitsHeld, 0);
  const total = round2(Math.max(0, totalEur));
  if (totalUnits <= 0 || total <= 0) {
    return eligible.map((h) => ({
      holderUserId: h.holderUserId,
      holderProfileId: h.holderProfileId,
      bondTrancheId: h.bondTrancheId,
      unitsHeld: h.unitsHeld,
      grossAmountEur: 0,
      withholdingEur: 0,
      netAmountEur: 0,
      status,
    }));
  }

  let distributed = 0;
  const shares: PayoutShare[] = eligible.map((h, i) => {
    const isLast = i === eligible.length - 1;
    // Le dernier reçoit le résidu pour garantir somme(parts) == total (au centime).
    const gross = isLast ? round2(total - distributed) : round2((total * h.unitsHeld) / totalUnits);
    distributed = round2(distributed + gross);
    return {
      holderUserId: h.holderUserId,
      holderProfileId: h.holderProfileId,
      bondTrancheId: h.bondTrancheId,
      unitsHeld: h.unitsHeld,
      grossAmountEur: gross,
      withholdingEur: 0,
      netAmountEur: gross, // net = gross - withholding (0) — cohérent CHECK 0019
      status,
    };
  });
  return shares;
}

/**
 * Calcule PUREMENT le montant total dû à l'obligataire pour une distribution.
 *   - `coupon` : coupon contractuel CIBLE (principal × taux × durée/12) — NON garanti.
 *   - `exit`   : total perçu par l'obligataire dans le WATERFALL central
 *                (principal remboursé + coupon perçu), depuis le moteur financier.
 *
 * Le waterfall n'est JAMAIS réimplémenté ici : on délègue à `buildDealSheet`.
 *
 * @returns { totalEur, distributionType, waterfallRank }.
 */
export function computeDistributionAmount(
  deal: DbDealRow,
  tranche: DealTranche | null,
  spv: DbSpvRow | null,
  kind: DistributionKind,
): { totalEur: number; distributionType: DistributionType; waterfallRank: number | null } {
  const input = mapDbDealToInput(deal, tranche, spv);

  if (kind === "coupon") {
    // Coupon contractuel cible (le versement reste plafonné par le produit
    // disponible — distribution variable). Rang waterfall obligations_coupon = 4.
    const totalEur = round2(
      couponObligataireDu(
        input.funding.obligations_cible_eur,
        input.funding.taux_coupon_obligataire_annuel,
        input.schedule.duree_mois,
      ),
    );
    return { totalEur, distributionType: "coupon", waterfallRank: 4 };
  }

  // EXIT : total obligataire (principal + coupon) du scénario CENTRAL.
  const sheet = buildDealSheet(input);
  const obligataire = sheet.scenarios.central.waterfall.obligataire;
  const totalEur = round2(obligataire.total_percu_eur);
  // Rang waterfall « principal obligataire » = 3 (cf. WaterfallTier order).
  return { totalEur, distributionType: "final", waterfallRank: 3 };
}

// ─── CORE : runDistribution ───────────────────────────────────────────────────

/** Dépendances injectables de la distribution. Défauts = Supabase/escrow. */
export interface RunDistributionDeps {
  store?: DistributionStore;
  escrow?: EscrowPort;
  idempotency?: IdempotencyStore;
}

/**
 * Exécute une distribution (coupon|exit) pour un deal (CORE partagé, idempotent).
 *
 * Pipeline :
 *   1. charge deal+tranche+spv → calcule le montant tranche via le MOTEUR
 *      (waterfall à l'exit, coupon cible sinon) ;
 *   2. lit les positions porteurs (cap table) → répartit au PRORATA des units ;
 *   3. crée `inv_distributions` + un `inv_distribution_payouts` par porteur ;
 *   4. règle en EUR via EscrowPort (release) en FAIL-SOFT → payouts `paid` si
 *      configuré, sinon `pending` (jamais d'échec dur) ;
 *   5. à l'exit : souscriptions `minted` → `redeemed` (terminal).
 *
 * IDEMPOTENT par `payout:{dealId}:{kind}:{round}` (round = nb de distributions du
 * type + 1). Un rejeu (même corps) rejoue la réponse mémorisée sans réécrire.
 *
 * @throws InvariantViolationError (deal introuvable / pas de tranche / I9).
 */
export async function runDistribution(
  _sb: ReturnType<typeof getSupabaseAdmin>,
  ctx: DistributionCtx,
  dealId: string,
  kind: DistributionKind,
  deps: RunDistributionDeps = {},
): Promise<RunDistributionResult> {
  if (!ctx?.tenantId) ctx = { tenantId: DEFAULT_TENANT_ID, actorUserId: ctx?.actorUserId ?? null };
  if (!dealId) throw new InvariantViolationError("I2", "runDistribution sans dealId explicite");

  const store = deps.store ?? supabaseDistributionStore();
  const escrow = deps.escrow ?? getEscrowPort();
  const idempotency = deps.idempotency ?? supabaseIdempotencyStore(ctx.tenantId);

  const tDistribution: DistributionType = kind === "coupon" ? "coupon" : "final";
  // Round déterministe : nb de distributions déjà émises de ce type + 1.
  const round = (await store.countDistributions(ctx.tenantId, dealId, tDistribution)) + 1;
  const idemKey = `payout:${dealId}:${kind}:${round}`;
  const bodyHash = hashBody({ dealId, kind, round });

  const { replayed, result } = await withIdempotency(idempotency, { key: idemKey, bodyHash }, async () =>
    executeDistribution(store, escrow, ctx, dealId, kind, round),
  );
  // `replayed` reflète la garde d'idempotence (la réponse mémorisée porte encore
  // `replayed:false` du calcul d'origine) → on l'écrase pour signaler le rejeu.
  return { ...result, replayed };
}

/** Cœur d'exécution (hors garde d'idempotence). Voir `runDistribution`. */
async function executeDistribution(
  store: DistributionStore,
  escrow: EscrowPort,
  ctx: DistributionCtx,
  dealId: string,
  kind: DistributionKind,
  round: number,
): Promise<RunDistributionResult> {
  // 1. Deal + tranche + SPV → montant via le moteur financier.
  const bundle = await store.findDealBundle(ctx.tenantId, dealId);
  if (!bundle) throw new InvariantViolationError("I2", `deal introuvable (${dealId})`);
  assertTenant(bundle.deal as { tenant_id: string }, ctx.tenantId);
  if (!bundle.tranche) throw new InvariantViolationError("I2", `aucune tranche obligataire (${dealId})`);

  const trancheRef = bundle.tranche.bondTrancheId;
  const { totalEur, distributionType, waterfallRank } = computeDistributionAmount(
    bundle.deal,
    bundle.tranche,
    bundle.spv,
    kind,
  );

  // 2. Positions porteurs (cap table) → prorata des units.
  const positions = await store.listHolderPositions(ctx.tenantId, dealId);
  const currency = "EUR"; // EUR par défaut (règlement séquestre tiers).

  // 3. Crée la distribution (niveau tranche), statut initial `planned`.
  const dateOnly = new Date().toISOString().slice(0, 10);
  const { id: distributionId } = await store.insertDistribution(ctx.tenantId, {
    deal_id: dealId,
    bond_tranche_id: trancheRef,
    distribution_type: distributionType,
    gross_amount_eur: totalEur,
    currency,
    waterfall_rank: waterfallRank,
    period_start: null,
    period_end: kind === "coupon" ? dateOnly : null,
    record_date: dateOnly,
    payment_date: dateOnly,
    status: "planned",
  });

  // 4. Règlement EUR via EscrowPort (release) — FAIL-SOFT.
  //    Escrow configuré → payouts `paid` ; sinon `pending` (jamais d'échec dur).
  const escrowConfigured = escrow.isConfigured();
  let escrowFailSoft = false;
  if (escrowConfigured) {
    try {
      await escrow.release({
        account: { dealId, provider: DEFAULT_ESCROW_PROVIDER, externalRef: `escrow:${dealId}` },
        idempotencyKey: `payout-release:${dealId}:${kind}:${round}`,
      });
    } catch {
      // L'échec du tiers ne bloque pas : payouts restent `pending` (rejouable).
      escrowFailSoft = true;
    }
  } else {
    escrowFailSoft = true;
  }
  const payoutStatus: PayoutStatus = escrowFailSoft ? "pending" : "paid";

  // Répartition prorata + persistance des payouts (un par porteur).
  const shares = allocateProRata(totalEur, positions, payoutStatus);
  for (const s of shares) {
    await store.insertPayout(ctx.tenantId, {
      distribution_id: distributionId,
      holder_profile_id: s.holderProfileId,
      holder_user_id: s.holderUserId,
      bond_tranche_id: s.bondTrancheId || trancheRef,
      units_held: s.unitsHeld,
      gross_amount_eur: s.grossAmountEur,
      withholding_eur: s.withholdingEur,
      net_amount_eur: s.netAmountEur,
      currency,
      payment_reference: escrowFailSoft ? null : `payout:${dealId}:${kind}:${round}`,
      status: s.status,
    });
  }

  // Statut de la distribution : `paid` si réglé, sinon `planned` (en attente escrow).
  await store.setDistributionStatus(ctx.tenantId, distributionId, escrowFailSoft ? "planned" : "paid");

  // 5. EXIT : le versement final éteint la créance. `minted` est l'état TERMINAL
  //    de la machine (aucune transition sortante) → on NE réécrit AUCUN statut
  //    hors schéma DB (pas de `redeemed` inexistant côté CHECK 0017) ; on compte
  //    seulement les créances éteintes pour l'audit.
  let mintedAtExit = 0;
  if (kind === "exit") {
    mintedAtExit = await store.countMintedSubscriptions(ctx.tenantId, dealId);
  }

  await store.audit({
    tenantId: ctx.tenantId,
    action: `distribution.${kind}`,
    actorUserId: ctx.actorUserId,
    entityId: dealId,
    after: {
      distributionId,
      round,
      distributionType,
      totalGrossEur: totalEur,
      holders: shares.length,
      payoutStatus,
      escrowFailSoft,
      mintedAtExit,
    },
  });

  return {
    replayed: false,
    distributionId,
    dealId,
    bondTrancheId: trancheRef,
    kind,
    round,
    distributionType,
    totalGrossEur: totalEur,
    holders: shares.length,
    payoutStatus,
    escrowFailSoft,
    payouts: shares,
  };
}

// ─── Lectures (présentation) ──────────────────────────────────────────────────

/** Mapping Row payout → vue domaine. */
function toPayout(row: PayoutRow): Payout {
  return {
    id: row.id,
    distributionId: row.distribution_id,
    dealId: row.deal_id ?? "",
    bondTrancheId: row.bond_tranche_id,
    holderUserId: row.holder_user_id,
    holderProfileId: row.holder_profile_id,
    unitsHeld: Number(row.units_held),
    grossAmountEur: Number(row.gross_amount_eur),
    withholdingEur: Number(row.withholding_eur),
    netAmountEur: Number(row.net_amount_eur),
    currency: row.currency,
    status: row.status as PayoutStatus,
    paidAt: row.paid_at,
    dealName: row.deal_name ?? null,
    distributionType: (row.distribution_type as DistributionType) ?? undefined,
    createdAt: row.created_at,
  };
}

/** Mapping Row distribution → vue domaine. */
function toDistribution(row: DistributionRow): Distribution {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    dealId: row.deal_id,
    bondTrancheId: row.bond_tranche_id,
    distributionType: row.distribution_type as DistributionType,
    grossAmountEur: Number(row.gross_amount_eur),
    currency: row.currency,
    status: row.status as Distribution["status"],
    waterfallRank: row.waterfall_rank,
    createdAt: row.created_at,
  };
}

/**
 * Payouts reçus par l'investisseur courant (coupons/exit), tous deals confondus
 * mais JAMAIS agrégés en une valeur consolidée (chaque payout = une créance d'un
 * deal précis). Filtré tenant+user (I9).
 */
export async function listPayoutsForUser(
  ctx: OwnershipContext,
  deps: { store?: DistributionStore } = {},
): Promise<Payout[]> {
  if (!ctx.userId) throw new InvariantViolationError("I9", "listPayoutsForUser sans userId");
  const store = deps.store ?? supabaseDistributionStore();
  const rows = await store.listPayoutsForUser(ctx.tenantId, ctx.userId);
  return rows.map((r) => {
    assertTenant(r as { tenant_id: string }, ctx.tenantId);
    if (r.holder_user_id !== ctx.userId) {
      throw new InvariantViolationError("I9", `payout owner mismatch (${r.id})`);
    }
    return toPayout(r);
  });
}

/** Distributions d'un deal (historique niveau tranche). Filtré tenant (I9). */
export async function listDistributionsForDeal(
  ctx: DistributionCtx,
  dealId: string,
  deps: { store?: DistributionStore } = {},
): Promise<Distribution[]> {
  const store = deps.store ?? supabaseDistributionStore();
  const rows = await store.listDistributionsForDeal(ctx.tenantId, dealId);
  return rows.map((r) => {
    assertTenant(r as { tenant_id: string }, ctx.tenantId);
    return toDistribution(r);
  });
}

// ─── Stubs lifecycle restants (Jalon 2) ───────────────────────────────────────

/** Ajoute un jalon travaux (photos, LTV, avancement). */
export async function addMilestone(_input: { dealId: string }): Promise<void> {
  throw new NotImplementedError("distribution.addMilestone — Jalon 2");
}

// ─── Adaptateur Supabase par défaut (service-role, colonnes RÉELLES) ──────────

const PAYOUT_COLS =
  "id, tenant_id, distribution_id, holder_profile_id, holder_user_id, bond_tranche_id, " +
  "units_held, gross_amount_eur, withholding_eur, net_amount_eur, currency, status, paid_at, created_at";

const DIST_COLS =
  "id, tenant_id, deal_id, bond_tranche_id, distribution_type, gross_amount_eur, currency, " +
  "waterfall_rank, status, created_at";

const CAP_COLS_DIST =
  "bond_tranche_id, holder_profile_id, holder_user_id, balance_units_after, created_at";

/**
 * Store Supabase aligné sur les colonnes RÉELLES :
 *   - inv_distributions / inv_distribution_payouts (0019) ;
 *   - inv_cap_table_entries (0018) pour les positions porteurs (DEEP) ;
 *   - inv_deals / inv_bond_tranches / inv_spvs (0016) pour le moteur financier ;
 *   - inv_subscriptions (0017) pour le passage minted→redeemed à l'exit ;
 *   - inv_append_audit_log (0020/0023, RPC).
 * Service-role → filtrage `tenant_id` partout (I9).
 */
export function supabaseDistributionStore(): DistributionStore {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("[distribution] Supabase service-role non configuré");

  return {
    async findDealBundle(tenantId, dealId) {
      const { data: deal, error } = await db
        .from("inv_deals")
        .select(
          "id, tenant_id, slug, name, deal_type, city, postal_code, country, acquisition_price_eur, " +
            "notary_fees_eur, works_budget_eur, other_costs_eur, total_project_cost_eur, senior_debt_eur, " +
            "sponsor_equity_eur, appraised_value_eur, target_irr_pct, duration_months, target_raise_eur, " +
            "min_ticket_eur, max_ticket_eur, opens_at, closes_at, scenarios, fees, waterfall, spv_id",
        )
        .eq("tenant_id", tenantId)
        .eq("id", dealId)
        .maybeSingle();
      if (error) throw error;
      if (!deal) return null;
      const d = deal as unknown as DbDealRow & { spv_id?: string | null };

      const { data: tranche, error: trErr } = await db
        .from("inv_bond_tranches")
        .select("id, coupon_rate_pct, total_nominal_eur, nominal_unit_eur")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .order("waterfall_rank", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (trErr) throw trErr;
      const t = tranche as { id: string; coupon_rate_pct: number | null; total_nominal_eur: number; nominal_unit_eur: number } | null;
      const trancheRow: DealTranche | null = t
        ? {
            bondTrancheId: t.id,
            coupon_rate_pct: t.coupon_rate_pct,
            total_nominal_eur: t.total_nominal_eur,
            nominal_unit_eur: t.nominal_unit_eur,
          }
        : null;

      let spv: DbSpvRow | null = null;
      if (d.spv_id) {
        const { data: spvRow, error: spvErr } = await db
          .from("inv_spvs")
          .select("senior_debt_amount_eur")
          .eq("tenant_id", tenantId)
          .eq("id", d.spv_id)
          .maybeSingle();
        if (spvErr) throw spvErr;
        spv = (spvRow as DbSpvRow | null) ?? null;
      }
      return { deal: d, tranche: trancheRow, spv };
    },

    async listHolderPositions(tenantId, dealId) {
      // Dernier solde connu par porteur (chronologie croissante → la dernière
      // valeur écrase). Source de vérité = cap table DEEP (I1).
      const { data, error } = await db
        .from("inv_cap_table_entries")
        .select(CAP_COLS_DIST)
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows =
        (data as
          | {
              bond_tranche_id: string;
              holder_profile_id: string | null;
              holder_user_id: string | null;
              balance_units_after: number;
            }[]
          | null) ?? [];
      const last = new Map<string, HolderPosition>();
      for (const r of rows) {
        if (!r.holder_user_id || !r.holder_profile_id) continue;
        last.set(r.holder_user_id, {
          holderUserId: r.holder_user_id,
          holderProfileId: r.holder_profile_id,
          bondTrancheId: r.bond_tranche_id,
          unitsHeld: Number(r.balance_units_after),
        });
      }
      return Array.from(last.values()).filter((p) => p.unitsHeld > 0);
    },

    async countDistributions(tenantId, dealId, type) {
      const { count, error } = await db
        .from("inv_distributions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .eq("distribution_type", type);
      if (error) throw error;
      return count ?? 0;
    },

    async insertDistribution(tenantId, row) {
      const { data, error } = await db
        .from("inv_distributions")
        .insert({ tenant_id: tenantId, ...row })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert_distribution_failed");
      return { id: (data as { id: string }).id };
    },

    async insertPayout(tenantId, row) {
      const { data, error } = await db
        .from("inv_distribution_payouts")
        .insert({
          tenant_id: tenantId,
          ...row,
          paid_at: row.status === "paid" ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert_payout_failed");
      return { id: (data as { id: string }).id };
    },

    async setDistributionStatus(tenantId, distributionId, status) {
      const { error } = await db
        .from("inv_distributions")
        .update({ status })
        .eq("tenant_id", tenantId)
        .eq("id", distributionId);
      if (error) throw error;
    },

    async countMintedSubscriptions(tenantId, dealId) {
      const { count, error } = await db
        .from("inv_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .eq("status", "minted");
      if (error) throw error;
      return count ?? 0;
    },

    async listPayoutsForUser(tenantId, userId) {
      const { data, error } = await db
        .from("inv_distribution_payouts")
        .select(
          `${PAYOUT_COLS}, inv_distributions!inner(deal_id, distribution_type, inv_deals(name))`,
        )
        .eq("tenant_id", tenantId)
        .eq("holder_user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data as unknown as (PayoutRow & {
        inv_distributions?: { deal_id?: string | null; distribution_type?: string | null; inv_deals?: { name?: string | null } | null } | null;
      })[]) ?? [];
      return rows.map((r) => ({
        ...r,
        deal_id: r.inv_distributions?.deal_id ?? null,
        distribution_type: r.inv_distributions?.distribution_type ?? null,
        deal_name: r.inv_distributions?.inv_deals?.name ?? null,
      }));
    },

    async listDistributionsForDeal(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_distributions")
        .select(DIST_COLS)
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as DistributionRow[]) ?? [];
    },

    async audit(input) {
      // Délègue au helper transverse (RPC SECURITY DEFINER, best-effort, Epic 1.6).
      await recordAudit(db, {
        tenantId: input.tenantId,
        action: input.action,
        actorUserId: input.actorUserId,
        actorRole: "service",
        entityType: "inv_deal",
        entityId: input.entityId,
        after: input.after,
      });
    },
  };
}
