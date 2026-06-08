/** Constantes partagées de la plateforme d'investissement.
 *  Centralise tous les magic numbers métier pour éviter la divergence silencieuse.
 */

/** Valeurs par défaut du simulateur de deal (formulaire opérateur). */
export const DEAL_DEFAULTS = {
  acquisition:    1_800_000,
  notary:           130_000,
  works:            420_000,
  other:             90_000,
  seniorDebt:     1_460_000,
  seniorRatePct:        4.5,  // %
  sponsorEquity:    240_000,
  targetRaise:      740_000,
  couponPct:            9,    // %
  durationMonths:      22,
  appraised:      2_520_000,
  resalePrice:    2_900_000,
  minTicket:        1_000,
  nominalUnitEur:   1_000,
} as const;

/** Frais de la plateforme et carried interest opérateur. */
export const PLATFORM_FEES = {
  entryPct:          0.01,   // 1 % frais d'entrée
  adminAnnuelPct:    0.005,  // 0.5 % frais admin annuels
  operateurAcqPct:   0.02,   // 2 % frais acquisition opérateur
  carriedPct:        0.2,    // 20 % carried interest
  hurdleAnnuel:      0.08,   // 8 % hurdle rate annuel
} as const;

/** Seuils LTV réglementaires — synchronisés avec buildLtvGauge() dans charts.ts. */
export const LTV_THRESHOLDS = {
  vert:   0.6,   // 60 %
  orange: 0.7,   // 70 %
  rouge:  0.8,   // 80 %
} as const;

/** Paramètres des scénarios de stress. */
export const SCENARIO_DEFAULTS = {
  pessimiste: { deltaPrixPct: -0.08, retardMois: 3 },
  central:    { deltaPrixPct:  0,    retardMois: 0 },
  optimiste:  { deltaPrixPct:  0.05, retardMois: 0 },
} as const;

/** Rendement locatif estimé pour l'auto-calcul du loyer net (mode locatif). */
export const LOCATIF_YIELD_PCT = 0.09;

/** Bornes de prix €/m² pour l'histogramme DVF (filtre des outliers). */
export const PRICE_PER_SQM_BOUNDS = { min: 500, max: 50_000 } as const;

/** Limites d'affichage dans la brochure PDF. */
export const BROCHURE_LIMITS = {
  specs:    12,
  dvf:       6,
  listings:  3,
} as const;

/** Nombre max de suggestions affichées dans l'interview d'estimation. */
export const SUGGESTIONS_MAX = 12;

/** Nombre max de badges affichés par deal/position. */
export const DEAL_BADGES_MAX = 3;

/** Pas de saisie du ticket (input step). */
export const TICKET_STEP = 1_000;
