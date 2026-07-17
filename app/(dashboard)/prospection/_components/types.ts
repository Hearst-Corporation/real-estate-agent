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

/** Un facteur du breakdown : libellé lisible + valeur en points. Miroir de ExplainFactor. */
export interface ExplainFactor {
  label: string;
  points: number;
}

/**
 * Explication normalisée et HONNÊTE d'un match, calculée côté route depuis
 * score_breakdown + features_snapshot (LIVE). Miroir de MatchExplanation
 * (lib/prospection/explain.ts). Jamais de raison inventée.
 */
export interface MatchExplanation {
  satisfaits: ExplainFactor[];
  imparfaits: ExplainFactor[];
  bloquants: ExplainFactor[];
  donneesManquantes: string[];
  scorePlafonne: boolean;
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
  score_breakdown?: Record<string, number> | null;
  /** Alias legacy. */
  bonus_breakdown?: Record<string, number>;
  /** Flags de conformité booléens persistés (zone_ok/budget_ok/…). */
  features_snapshot?: Record<string, unknown> | null;
  engine_version?: string;
  // ── Champs enrichis OPTIONNELS (présents si la route les expose) ──
  recommandation?: Recommandation;
  /** Explication legacy (moteur) — conservée pour rétro-compat. */
  explain?: MatchExplain;
  /** Explication normalisée honnête calculée côté route GET matchs (LIVE). */
  explanation?: MatchExplanation;
  valuation?: MatchValuation;
  annonce: Annonce;
}

// ── Critère acquéreur (profil de recherche) — aligné sur les colonnes LIVE 0043
export type Urgence = "faible" | "normale" | "haute" | "urgente";
export type AlerteFrequence = "immediate" | "quotidien" | "hebdo" | "off";

export interface Critere {
  id: string;
  nom: string;
  lead_id?: string | null;
  zones?: unknown;
  budget_min?: number | null;
  budget_max?: number | null;
  surface_min?: number | null;
  surface_max?: number | null;
  pieces_min?: number | null;
  pieces_max?: number | null;
  type_bien?: string[] | null;
  telephone?: string | null;
  alerte_email?: boolean;
  alerte_whatsapp?: boolean;
  // ── 0043 LIVE ──
  alerte_frequence?: AlerteFrequence;
  urgence?: Urgence | null;
  exclusions?: string[] | null;
  criteres_secondaires?: Record<string, string | number | boolean> | null;
}

/** Un acquéreur (lead) et ses profils de recherche regroupés. */
export interface AcquereurGroup {
  leadId: string | null;
  nom: string;
  criteres: Critere[];
}

// ── Historique des propositions (réponse /api/prospection/history) ──
export interface PropositionRow {
  id: string;
  signal: string;
  created_at: string;
  critere_id: string | null;
  match_id: string | null;
  score_match: number | null;
  annonce: { id?: string; titre?: string | null; ville?: string | null; prix?: number | null } | null;
}

export interface ContactAttemptRow {
  id: string;
  statut: string;
  canal: string;
  lead_id: string | null;
  annonce_id: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface HistoryData {
  propositions: PropositionRow[];
  contactAttempts: ContactAttemptRow[];
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
