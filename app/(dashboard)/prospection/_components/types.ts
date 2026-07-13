// Types partagés page prospection ⇄ composants de détail.
// Alignés sur ce que les routes API renvoient RÉELLEMENT
// (/api/prospection/annonces, /matchs, /annonces/[id]/link-crm|estimate,
//  /contact, /optout). Les champs enrichis (recommandation/explain/valuation)
// sont OPTIONNELS : le moteur les produit, la route GET matchs peut ne pas
// (encore) les exposer → on les consomme défensivement sans jamais inventer.

export interface Annonce {
  id: string;
  type_bien: string;
  titre?: string;
  prix?: number;
  prix_m2?: number;
  surface_m2?: number;
  /** Alias legacy */
  surface?: number;
  nb_pieces?: number;
  /** Alias legacy */
  pieces?: number;
  nb_chambres?: number;
  code_postal?: string;
  commune?: string;
  /** Alias legacy */
  ville?: string;
  url?: string;
  photos_urls?: string[];
  /** Alias legacy */
  photos?: string[];
  is_pap?: boolean;
  type_annonceur?: "particulier" | "pro" | string;
  prix_baisse_delta?: number | null;
  dpe_note?: string | null;
  source_platform?: string;
  /** Alias source côté route annonces */
  source?: string;
  age_hours?: number | null;
  terrasse?: boolean;
  parking?: boolean;
  ascenseur?: boolean;
  jardin?: boolean;
  piscine?: boolean;
  // ── Liens CRM (posés par link-crm / estimate) ──
  lead_id?: string | null;
  property_id?: string | null;
  estimation_id?: string | null;
  demarchage_bloque?: boolean | null;
}

/** Facteurs d'explicabilité — miroir de MatchExplain (lib/prospection/matching/match.ts). */
export interface MatchExplain {
  satisfaits?: string[];
  nonSatisfaits?: string[];
  bloquants?: string[];
  donneesManquantes?: string[];
  scorePlafonne?: boolean;
}

export type ValuationGapStatus =
  | "below_range"
  | "within_range"
  | "above_range"
  | "low_confidence"
  | "unavailable";

/** Miroir de ValuationComparison (moteur). */
export interface MatchValuation {
  status?: ValuationGapStatus;
  gap?: number | null;
  marketValue?: number | null;
  lowValue?: number | null;
  highValue?: number | null;
}

export type Recommandation = "high_priority" | "review" | "low_priority" | "rejected";

export interface Match {
  id: string;
  score_match: number;
  alerte_envoyee?: boolean;
  created_at?: string;
  statut?: string;
  annonce_id?: string;
  critere_id?: string;
  date_match?: string;
  /** Facteurs de score réels renvoyés par la route GET matchs. */
  score_breakdown?: Record<string, number>;
  /** Alias legacy. */
  bonus_breakdown?: Record<string, number>;
  engine_version?: string;
  // ── Champs enrichis OPTIONNELS (présents si la route les expose) ──
  recommandation?: Recommandation;
  explain?: MatchExplain;
  valuation?: MatchValuation;
  annonce: Annonce;
}

/** Réponse /api/prospection/annonces/[id]/estimate → price_comparison. */
export type PriceComparison =
  | { pending: true; asking_price: number | null; market_value: null }
  | {
      pending: false;
      asking_price: number;
      market_value: number;
      delta_eur: number;
      delta_pct: number;
    };
