/**
 * FIXTURES — jeux de données de référence pour les tests et les démos.
 *
 * `RESIDENCE_HAUSSMANN` reprend FIDÈLEMENT l'exemple chiffré de l'étude P7
 * ("Résidence Haussmann — Lyon 6"), section "Économie de l'opération" :
 *
 *   Prix d'acquisition       : 1 800 000 €
 *   Frais de notaire (~)     :   130 000 €
 *   Budget travaux           :   420 000 €
 *   Frais divers / portage   :    90 000 €
 *   ─────────────────────────────────────
 *   COÛT TOTAL DU PROJET     : 2 440 000 €
 *   Dette bancaire senior    : 1 460 000 €   (LTC ~60 %)
 *   Equity sponsor           :   240 000 €   (skin in the game ~10 %)
 *   Obligations recherchées  :   740 000 €
 *   LTV (dette/valeur)       :   ~58 %
 *   Durée cible              :   22 mois
 *
 *   Frais plateforme : 1 % entrée + 0,5 %/an admin (P7 "Frais")
 *   Frais opérateur  : 2 % acquisition + 20 % carried > hurdle 8 % (P7 "Frais")
 *
 * Le financement est PARFAITEMENT équilibré (1 460 000 + 240 000 + 740 000 =
 * 2 440 000 = coût total), ce qui en fait un cas de test idéal.
 *
 * Valeur expertisée : pour obtenir la LTV ~58 % de l'étude avec une dette de
 * 1 460 000 €, la valeur de référence est ≈ 2 517 241 € (1 460 000 / 0,58).
 * On retient une valeur expertisée RONDE de 2 520 000 € → LTV = 57,9 %, conforme
 * au "~58 %" de l'étude. (La valeur expertisée diffère du prix de revente
 * central, qui intègre la marge de l'opération.)
 *
 * Prix de revente central : l'étude vise un TRI ~10 % au central. On calibre le
 * prix de revente central à 2 900 000 € (marge marchand ≈ 18,9 %), cohérent avec
 * un MdB qui dégage de quoi servir la dette + le principal + un coupon
 * obligataire à ~9 % et laisser un résiduel d'equity. Les tests vérifient les
 * INVARIANTS (équilibre, LTV, ordre du waterfall, signe des TRI), pas une
 * valeur de TRI marketing.
 */

import type { DealInput } from './types';

export const RESIDENCE_HAUSSMANN: DealInput = {
  id: 'residence-haussmann-lyon6',
  nom: 'Résidence Haussmann — Lyon 6',
  localisation: 'Lyon 6e (adresse exacte au closing/NDA)',
  type_operation: 'marchand_de_biens',

  costs: {
    prix_acquisition_eur: 1_800_000,
    frais_notaire_eur: 130_000,
    budget_travaux_eur: 420_000,
    frais_divers_portage_eur: 90_000,
  },

  funding: {
    dette_senior_eur: 1_460_000,
    taux_dette_senior_annuel: 0.045, // 4,5 %/an, hypothèque 1er rang
    equity_sponsor_eur: 240_000,
    obligations_cible_eur: 740_000,
    taux_coupon_obligataire_annuel: 0.09, // coupon CIBLE 9 %/an, NON GARANTI
  },

  fees: {
    frais_plateforme_entree_pct: 0.01, // 1 % à l'entrée (P7)
    frais_plateforme_admin_annuel_pct: 0.005, // 0,5 %/an admin (P7)
    frais_operateur_acquisition_pct: 0.02, // 2 % acquisition (P7)
    carried_operateur_pct: 0.2, // 20 % carried (P7)
    hurdle_annuel: 0.08, // hurdle 8 % (P7)
  },

  schedule: {
    duree_mois: 22, // durée cible (P7)
    date_closing: '2026-09-01',
  },

  exit: {
    prix_revente_central_eur: 2_900_000,
    valeur_expertise_eur: 2_520_000, // → LTV 57,9 % ≈ "~58 %" de l'étude
  },

  scenarios: {
    // P7 : pessimiste = revente -8 % ; central = business plan ; optimiste = +5 %.
    pessimiste: { delta_prix_revente_pct: -0.08, retard_mois: 3 },
    central: { delta_prix_revente_pct: 0, retard_mois: 0 },
    optimiste: { delta_prix_revente_pct: 0.05, retard_mois: 0 },
  },

  ticket_min_eur: 1_000,
  ticket_max_eur: 100_000,
  day_count: 'ACT_365',
};

/**
 * Variante LOCATIF pour tester le DSCR (étude P11). Mêmes coûts, mais détention
 * pour loyers : loyer net annuel ciblé, pas de marge de revente massive.
 */
export const IMMEUBLE_LOCATIF: DealInput = {
  ...RESIDENCE_HAUSSMANN,
  id: 'immeuble-locatif-test',
  nom: 'Immeuble locatif (test DSCR)',
  type_operation: 'locatif',
  funding: {
    ...RESIDENCE_HAUSSMANN.funding,
    taux_dette_senior_annuel: 0.04,
  },
  exit: {
    prix_revente_central_eur: 2_650_000, // valeur résiduelle à la cession
    valeur_expertise_eur: 2_520_000,
    loyer_net_annuel_eur: 90_000, // DSCR = 90 000 / (1 460 000 × 4 %) = 1,54
  },
};

/**
 * Cas DÉGRADÉ pour tester les warnings et la perte en capital : marge faible,
 * LTV élevée, revente pessimiste sous le principal obligataire.
 */
export const DEAL_DEGRADE: DealInput = {
  ...RESIDENCE_HAUSSMANN,
  id: 'deal-degrade-test',
  nom: 'Deal dégradé (test warnings)',
  funding: {
    ...RESIDENCE_HAUSSMANN.funding,
    dette_senior_eur: 2_100_000, // LTV élevée
    equity_sponsor_eur: 100_000,
    obligations_cible_eur: 240_000,
  },
  exit: {
    prix_revente_central_eur: 2_500_000, // marge faible vs coût total 2 440 000
    valeur_expertise_eur: 2_520_000, // LTV = 2 100 000 / 2 520 000 = 83,3 %
  },
  scenarios: {
    pessimiste: { delta_prix_revente_pct: -0.2, retard_mois: 6 },
    central: { delta_prix_revente_pct: 0, retard_mois: 0 },
    optimiste: { delta_prix_revente_pct: 0.05, retard_mois: 0 },
  },
};
