/**
 * MOTEUR FINANCIER — DATA CONTRACTS
 * =================================
 *
 * Types TypeScript du moteur de calcul financier des deals + data des 11
 * graphiques (étude P8). Tout découle des contraintes VERROUILLÉES de l'étude
 * `docs/etude-immobilier-tokenise-2026.md` :
 *
 *   - Modèle = OBLIGATIONS émises par une SAS opérationnelle (marchand de
 *     biens / promotion). L'investisseur est un CRÉANCIER, pas un co-investisseur
 *     d'un portefeuille géré (anti-FIA, P2/P15).
 *   - 1 SPV = 1 opération. Pas de pooling, pas de NAV globale, pas de
 *     rebalancing (anti-FIA SAN-2025-08).
 *   - Distribution VARIABLE, jamais garantie (P6 badge "Distribution variable" :
 *     « interdit de promettre un taux »). Tous les rendements sont CIBLES.
 *   - Règlement EUR par défaut. Tous les montants sont en EUROS, en valeur
 *     absolue (pas de centimes flottants masqués : voir `lib/money`).
 *
 * AUCUN IO, AUCUN LLM, AUCUN accès réseau dans ce domaine. Fonctions pures
 * uniquement, 100 % déterministes et testables.
 *
 * Convention monétaire : tous les champs `*_eur` sont des nombres en euros
 * (unité = 1 €). On NE travaille PAS en centimes ici car les inputs deal
 * (prix d'acquisition, travaux…) sont des montants "ronds" à l'euro et la
 * précision flottante double (IEEE-754) est largement suffisante jusqu'à
 * ~9 × 10^15. Les arrondis d'affichage sont gérés à la présentation.
 */

// ════════════════════════════════════════════════════════════════════════════
// 1. ÉNUMÉRATIONS MÉTIER
// ════════════════════════════════════════════════════════════════════════════

/**
 * Type d'opération de la SPV. Conditionne le profil de cashflow :
 *  - `marchand_de_biens` : achat → travaux → REVENTE. Gain in fine, pas de
 *    coupon récurrent (étude P6, badge "Sortie à revente").
 *  - `promotion` : construction-vente (souvent via SCCV sous-jacente détenue
 *    par la SAS — P3). Gain in fine.
 *  - `locatif` : détention pour loyers → coupons périodiques + valeur
 *    résiduelle (étude P6, badge "Locatif"). DSCR pertinent.
 */
export type OperationType = 'marchand_de_biens' | 'promotion' | 'locatif';

/** Identifiant des 3 scénarios standard de l'étude (P7, P8 graph 5). */
export type ScenarioKey = 'pessimiste' | 'central' | 'optimiste';

/**
 * Convention de période pour l'annualisation du TRI. ACT/365 par défaut
 * (cohérent avec un règlement EUR et des durées exprimées en mois/jours).
 */
export type DayCountConvention = 'ACT_365' | 'ACT_360' | '30_360';

// ════════════════════════════════════════════════════════════════════════════
// 2. INPUTS BRUTS D'UN DEAL
// ════════════════════════════════════════════════════════════════════════════

/**
 * Économie de l'opération — postes de coût (étude P7, section "Économie de
 * l'opération"). Tous en euros. La somme constitue le COÛT TOTAL DU PROJET.
 */
export interface DealCosts {
  /** Prix d'acquisition de l'immeuble. */
  prix_acquisition_eur: number;
  /**
   * Frais de notaire / mutation. Réduits si engagement de revente art. 1115
   * CGI (droits ~0,715 %) pour un marchand de biens — voir étude P13.
   */
  frais_notaire_eur: number;
  /** Budget travaux / rénovation / construction. */
  budget_travaux_eur: number;
  /**
   * Frais divers + portage (intérêts intercalaires hors dette modélisée,
   * assurances, honoraires techniques, commercialisation…).
   */
  frais_divers_portage_eur: number;
}

/**
 * Structure de financement (étude P7 + P4). Côté PASSIF de la SPV.
 *
 *   COÛT TOTAL = dette senior + equity sponsor + obligations (collecte)
 *
 * Cet équilibre est vérifié par `metrics.checkFundingBalance`.
 */
export interface DealFunding {
  /**
   * Dette bancaire SENIOR (hypothèque 1er rang). Prêtée à la SAS, JAMAIS au
   * smart contract (étude P11). Premier remboursé dans le waterfall.
   */
  dette_senior_eur: number;
  /** Taux d'intérêt annuel nominal de la dette senior (ex. 0.055 = 5,5 %). */
  taux_dette_senior_annuel: number;
  /**
   * Equity / quasi-equity apporté par le SPONSOR (skin in the game). Dernier
   * servi dans le waterfall (étude P7 ligne 6). Aligne l'opérateur.
   */
  equity_sponsor_eur: number;
  /**
   * Montant des OBLIGATIONS recherché auprès des investisseurs token holders
   * = objectif de levée. Titres de créance subordonnés à la dette senior.
   */
  obligations_cible_eur: number;
  /**
   * Taux de coupon CIBLE des obligations (annuel nominal). NON GARANTI.
   * Sert au calcul du coupon dû dans le waterfall ; le versement reste
   * conditionné au produit disponible (distribution variable).
   */
  taux_coupon_obligataire_annuel: number;
}

/**
 * Grille de frais (étude P7 "Frais" + waterfall lignes 4-5).
 */
export interface DealFees {
  /** Frais plateforme à l'entrée (% de la collecte obligataire). Ex. 0.01. */
  frais_plateforme_entree_pct: number;
  /** Frais plateforme d'administration annuels (% de la collecte). Ex. 0.005. */
  frais_plateforme_admin_annuel_pct: number;
  /** Frais opérateur à l'acquisition (% du prix d'acquisition). Ex. 0.02. */
  frais_operateur_acquisition_pct: number;
  /**
   * Carried (intéressement) de l'opérateur, prélevé UNIQUEMENT sur la
   * performance AU-DELÀ du hurdle (étude P7 ligne 5). Ex. 0.20.
   */
  carried_operateur_pct: number;
  /**
   * Hurdle de TRI annuel au-delà duquel le carried s'applique (ex. 0.08).
   * En dessous, l'opérateur ne touche pas de carried.
   */
  hurdle_annuel: number;
}

/**
 * Paramètres de durée / calendrier (étude P7 "Durée cible" + "Calendrier").
 */
export interface DealSchedule {
  /** Durée cible totale de l'opération en MOIS (acquisition → exit). */
  duree_mois: number;
  /**
   * Date de closing / déblocage des fonds (ISO `YYYY-MM-DD`). Origine du
   * décaissement investisseur (t0 du TRI investisseur).
   */
  date_closing: string;
}

/**
 * Hypothèse de revente / valorisation de sortie (étude P7 "Rendement" +
 * P8 graphs 6, 11). Pour un MdB/promotion = prix de revente. Pour un locatif =
 * valeur résiduelle à la cession.
 */
export interface DealExit {
  /** Prix de revente / valeur de sortie CENTRAL (business plan). */
  prix_revente_central_eur: number;
  /**
   * Valeur expertisée "à dire d'expert" servant au calcul de la LTV
   * (étude P8 graph 10, P11). Si absente, on retombe sur le prix de revente
   * central comme proxy conservateur.
   */
  valeur_expertise_eur?: number;
  /**
   * Loyer net annuel attendu (locatif uniquement). Sert au DSCR et aux
   * coupons (étude P11, DSCR cible > 1,2).
   */
  loyer_net_annuel_eur?: number;
}

/**
 * Décalages de scénario (étude P7) — exprimés en VARIATION RELATIVE du prix de
 * revente et en RETARD de travaux (mois). Le scénario central = (0, 0).
 */
export interface ScenarioShift {
  /** Variation du prix de revente vs central (ex. -0.08 = -8 %). */
  delta_prix_revente_pct: number;
  /** Retard de travaux / d'exit en mois (allonge le portage). Ex. 3. */
  retard_mois: number;
}

/** Jeu des 3 scénarios. Le central est implicitement (0, 0) mais explicité. */
export interface ScenarioSet {
  pessimiste: ScenarioShift;
  central: ScenarioShift;
  optimiste: ScenarioShift;
}

/**
 * INPUT RACINE d'un deal. Agrège tout ce qui est nécessaire pour produire la
 * fiche deal complète + les 11 graphiques. Aucune donnée dérivée ici : tout
 * est calculé par le moteur.
 */
export interface DealInput {
  /** Identifiant stable du deal (slug). */
  id: string;
  /** Nom commercial (ex. "Résidence Haussmann — Lyon 6"). */
  nom: string;
  /** Localisation approximative (adresse exacte au closing/NDA — étude P7). */
  localisation: string;
  type_operation: OperationType;

  costs: DealCosts;
  funding: DealFunding;
  fees: DealFees;
  schedule: DealSchedule;
  exit: DealExit;
  scenarios: ScenarioSet;

  /**
   * Ticket minimum / maximum investisseur (étude P7 "Paramètres de levée").
   * Purement informatif pour le moteur de calcul (pas de contrainte d'agrégat).
   */
  ticket_min_eur?: number;
  ticket_max_eur?: number;
  /** Day count pour l'annualisation. Défaut ACT/365. */
  day_count?: DayCountConvention;
}

// ════════════════════════════════════════════════════════════════════════════
// 3. PRIMITIVES DE CALCUL — CASHFLOWS & IRR
// ════════════════════════════════════════════════════════════════════════════

/**
 * Un flux de trésorerie daté. Convention de signe :
 *   - négatif = décaissement de l'investisseur (souscription).
 *   - positif = encaissement de l'investisseur (coupon, remboursement).
 */
export interface CashFlow {
  /** Date du flux (ISO `YYYY-MM-DD`). */
  date: string;
  /** Montant signé en euros. */
  montant_eur: number;
  /** Libellé optionnel (ex. "Souscription", "Coupon T1", "Remboursement"). */
  label?: string;
}

/** Résultat d'un calcul d'IRR/XIRR avec diagnostic de convergence. */
export interface IrrResult {
  /**
   * Taux annualisé (ex. 0.102 = 10,2 %). `null` si non calculable (flux tous
   * de même signe, pas de racine, divergence).
   */
  irr: number | null;
  /** Méthode ayant convergé. */
  methode: 'newton' | 'bisection' | 'aucune';
  /** Nombre d'itérations consommées. */
  iterations: number;
  /** Valeur absolue de la VAN résiduelle au taux trouvé (qualité du zéro). */
  npv_residuel: number;
  /** True si convergence sous tolérance. */
  converge: boolean;
}

// ════════════════════════════════════════════════════════════════════════════
// 4. WATERFALL DE DISTRIBUTION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Identifiants ordonnés des étages du waterfall (étude P7, ordre de paiement
 * à l'exit). L'ordre du type EST l'ordre de priorité.
 */
export type WaterfallTierKey =
  | 'dette_senior_principal' //  1. Remboursement principal dette senior
  | 'dette_senior_interets' //   1bis. + intérêts senior
  | 'obligations_principal' //   2. Remboursement principal obligataire
  | 'obligations_coupon' //      3. Coupon obligataire (cible)
  | 'frais_plateforme' //        4a. Frais plateforme
  | 'frais_operateur' //         4b. Frais opérateur
  | 'carried_operateur' //       5. Carried au-delà du hurdle
  | 'equity_sponsor'; //         6. Solde → equity sponsor

/**
 * Un étage du waterfall après application sur le produit de revente.
 */
export interface WaterfallTier {
  key: WaterfallTierKey;
  /** Libellé humain (FR). */
  label: string;
  /** Montant DÛ à cet étage (avant rationnement par le solde disponible). */
  du_eur: number;
  /** Montant effectivement PAYÉ (≤ dû si le solde manque). */
  paye_eur: number;
  /** Solde restant APRÈS paiement de cet étage. */
  solde_apres_eur: number;
  /** Manque (du - paye) si l'étage n'est pas intégralement servi. */
  shortfall_eur: number;
}

/**
 * Résultat complet du waterfall pour un produit de revente donné.
 */
export interface WaterfallResult {
  /** Produit de revente injecté en haut de cascade. */
  produit_revente_eur: number;
  /** Étages dans l'ordre de priorité. */
  tiers: WaterfallTier[];
  /**
   * Synthèse côté investisseur obligataire (ce qui le concerne directement) :
   * principal remboursé + coupon perçu.
   */
  obligataire: {
    principal_rembourse_eur: number;
    coupon_percu_eur: number;
    total_percu_eur: number;
    /** Multiple sur capital obligataire (total perçu / principal investi). */
    multiple_sur_capital: number;
    /** Perte en capital obligataire (>0 si principal non intégralement rendu). */
    perte_capital_eur: number;
  };
  /** Reste pour l'equity sponsor (dernier servi). */
  equity_residuel_eur: number;
}

// ════════════════════════════════════════════════════════════════════════════
// 5. MÉTRIQUES DE RISQUE / STRUCTURE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Indicateurs structurels du deal (étude P8 graphs 10, 11 + P11).
 */
export interface DealMetrics {
  /** Coût total du projet = somme des postes de coût. */
  cout_total_eur: number;
  /** LTV = dette senior / valeur expertisée (étude P8 graph 10). */
  ltv: number;
  /** LTC = dette senior / coût total (loan-to-cost, étude P7). */
  ltc: number;
  /**
   * DSCR = revenu net / service de la dette (locatif). `null` si non locatif
   * ou loyer absent (étude P11, cible > 1,2).
   */
  dscr: number | null;
  /**
   * Marge marchand = (prix_revente - coût_total) / coût_total (étude P8
   * graph 11). < 0,10 = fragile.
   */
  marge_marchand_pct: number;
  /** Marge marchand en valeur absolue (€). */
  marge_marchand_eur: number;
  /** Part de l'equity sponsor dans le financement (skin in the game). */
  skin_in_the_game_pct: number;
  /** Coussin de sécurité = (valeur - dette) / valeur. */
  coussin_securite_pct: number;
}

// ════════════════════════════════════════════════════════════════════════════
// 6. RÉSULTAT D'UN SCÉNARIO
// ════════════════════════════════════════════════════════════════════════════

/** Sortie complète d'un scénario : flux, waterfall, IRR investisseur. */
export interface ScenarioResult {
  key: ScenarioKey;
  shift: ScenarioShift;
  /** Prix de revente effectif (central × (1 + delta)). */
  prix_revente_eur: number;
  /** Durée effective (base + retard). */
  duree_mois: number;
  /** Waterfall calculé sur ce prix de revente. */
  waterfall: WaterfallResult;
  /** Flux investisseur obligataire (souscription négative + perceptions). */
  cashflows_investisseur: CashFlow[];
  /** TRI annualisé investisseur obligataire. */
  irr_investisseur: IrrResult;
  /** Rendement total simple (non annualisé) : total perçu / investi - 1. */
  rendement_total_pct: number;
}

// ════════════════════════════════════════════════════════════════════════════
// 7. DATA CONTRACTS DES 11 GRAPHIQUES (étude P8)
// ════════════════════════════════════════════════════════════════════════════
//
// Chaque contrat est SELF-CONTAINED : il porte ses propres données +
// métadonnées d'affichage (label, unité, formule, interprétation) afin que la
// couche UI (composants Cockpit) n'ait AUCUNE logique financière.

/** Segment générique nom/valeur/part pour donut & barres. */
export interface ChartSegment {
  key: string;
  label: string;
  valeur_eur: number;
  /** Part [0..1] du total. */
  part: number;
}

/** Graph 1 — Répartition dette/equity (donut). */
export interface ChartDetteEquity {
  type: 'donut';
  titre: string;
  segments: ChartSegment[]; // dette senior, obligations, equity sponsor
  total_eur: number;
  interpretation: string;
}

/** Graph 2 — Use of funds (barres empilées). */
export interface ChartUseOfFunds {
  type: 'stacked_bar';
  titre: string;
  segments: ChartSegment[]; // acquisition, notaire, travaux, frais/portage
  total_eur: number;
  interpretation: string;
}

/** Une marche de la cascade waterfall pour le graphique 3. */
export interface WaterfallStep {
  key: WaterfallTierKey | 'produit_revente' | 'reste';
  label: string;
  /** Variation appliquée (négative pour un paiement sortant). */
  delta_eur: number;
  /** Cumul après cette marche (base de la barre flottante). */
  cumul_eur: number;
  /** True pour les barres "total" (produit de revente / reste). */
  is_total: boolean;
}

/** Graph 3 — Waterfall de distribution (cascade). */
export interface ChartWaterfall {
  type: 'waterfall';
  titre: string;
  steps: WaterfallStep[];
  interpretation: string;
}

/** Un jalon daté pour le Gantt. */
export interface GanttMilestone {
  key: string;
  label: string;
  /** Mois de début (0 = closing). */
  debut_mois: number;
  /** Durée en mois. */
  duree_mois: number;
}

/** Graph 4 — Calendrier opérationnel (Gantt). */
export interface ChartGantt {
  type: 'gantt';
  titre: string;
  jalons: GanttMilestone[];
  duree_totale_mois: number;
  interpretation: string;
}

/** Une barre de scénario pour le graphique 5. */
export interface ScenarioBar {
  key: ScenarioKey;
  label: string;
  /** TRI annualisé (null si non calculable). */
  irr: number | null;
  /** Rendement total simple. */
  rendement_total_pct: number;
}

/** Graph 5 — Scénarios de performance (barres groupées). */
export interface ChartScenarios {
  type: 'grouped_bar';
  titre: string;
  barres: ScenarioBar[];
  interpretation: string;
}

/** Un point d'une courbe de sensibilité. */
export interface SensitivityPoint {
  /** Valeur de l'axe X (ex. -0.15 pour -15 %, ou 6 pour 6 mois de retard). */
  x: number;
  /** Rendement résultant (TRI annualisé ; null si non calculable). */
  irr: number | null;
  /** Rendement total simple correspondant. */
  rendement_total_pct: number;
}

/** Graph 6 — Sensibilité prix de revente → rendement (courbe). */
export interface ChartSensibilitePrix {
  type: 'line';
  titre: string;
  x_label: string;
  points: SensitivityPoint[];
  /** Point mort : variation de prix où le TRI = 0 (null si hors plage). */
  point_mort_x: number | null;
  interpretation: string;
}

/** Graph 7 — Sensibilité retard travaux → rendement (courbe). */
export interface ChartSensibiliteRetard {
  type: 'line';
  titre: string;
  x_label: string;
  points: SensitivityPoint[];
  interpretation: string;
}

/** Un point mensuel de trésorerie cumulée. */
export interface CashflowPoint {
  mois: number;
  /** Flux net du mois (sorties travaux négatives, entrée revente positive). */
  flux_mois_eur: number;
  /** Trésorerie cumulée projet (J-curve). */
  cumul_eur: number;
}

/** Graph 8 — Cashflow prévisionnel (aires). */
export interface ChartCashflow {
  type: 'area';
  titre: string;
  points: CashflowPoint[];
  interpretation: string;
}

/** Un axe du radar de risque. */
export interface RiskAxis {
  key: string;
  label: string;
  /** Note de risque [0..5] (5 = risque max). */
  note: number;
}

/** Graph 9 — Exposition au risque (radar). */
export interface ChartRisque {
  type: 'radar';
  titre: string;
  axes: RiskAxis[];
  interpretation: string;
}

/** Graph 10 — LTV (jauge). */
export interface ChartLtvGauge {
  type: 'gauge';
  titre: string;
  /** Valeur LTV [0..1]. */
  valeur: number;
  /** Seuils d'alerte (étude P8 graph 10 : 60/70/80 %). */
  seuils: { vert: number; orange: number; rouge: number };
  interpretation: string;
}

/** Graph 11 — Marge marchand (barre + ligne). */
export interface ChartMargeMarchand {
  type: 'bar_line';
  titre: string;
  cout_total_eur: number;
  prix_revente_eur: number;
  marge_eur: number;
  marge_pct: number;
  /** Seuil de fragilité (< 10 % = fragile, étude P8 graph 11). */
  seuil_fragilite_pct: number;
  interpretation: string;
}

/**
 * Conteneur des 11 graphiques de l'étude (P8). Indexé pour un mapping UI
 * direct. L'ordre correspond exactement à la numérotation de l'étude.
 */
export interface DealCharts {
  g1_dette_equity: ChartDetteEquity;
  g2_use_of_funds: ChartUseOfFunds;
  g3_waterfall: ChartWaterfall;
  g4_gantt: ChartGantt;
  g5_scenarios: ChartScenarios;
  g6_sensibilite_prix: ChartSensibilitePrix;
  g7_sensibilite_retard: ChartSensibiliteRetard;
  g8_cashflow: ChartCashflow;
  g9_risque: ChartRisque;
  g10_ltv: ChartLtvGauge;
  g11_marge_marchand: ChartMargeMarchand;
}

// ════════════════════════════════════════════════════════════════════════════
// 8. FICHE DEAL COMPLÈTE (sortie racine du moteur)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Sortie complète du moteur : tout ce qu'il faut pour rendre la fiche deal
 * (étude P7) + les 11 graphiques (P8), sans aucun recalcul côté UI.
 *
 * IMPORTANT : pas de rendement garanti. `rendement_cible` est explicitement
 * un objectif issu du scénario central (badge "Distribution variable", P6).
 */
export interface DealSheet {
  input: DealInput;
  metrics: DealMetrics;
  /** Les 3 scénarios calculés. */
  scenarios: Record<ScenarioKey, ScenarioResult>;
  /** TRI cible (= scénario central) — NON GARANTI. */
  rendement_cible_irr: number | null;
  charts: DealCharts;
  /**
   * Avertissements de cohérence détectés à la construction (ex. financement
   * déséquilibré, marge négative, LTV > 80 %). Vide = nominal.
   */
  warnings: string[];
}
