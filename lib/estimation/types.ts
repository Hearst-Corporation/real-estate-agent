import type { ProviderProvenance } from './provenance';

// ─── PropertyData ────────────────────────────────────────────────────────────

export type PropertyData = {
  type_bien:
    | 'appartement'
    | 'maison'
    | 'immeuble'
    | 'local_commercial'
    | 'terrain'
    | 'autre'
    | null;
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  secteur: string | null;
  surface_habitable_m2: number | null;
  surface_carrez_m2: number | null;
  surface_carrez_confirmee: boolean | null;
  nombre_pieces: number | null;
  nombre_chambres: number | null;
  etage: number | null;
  nb_etages_total: number | null;
  ascenseur: boolean | null;
  vue: string | null;
  exposition:
    | 'nord'
    | 'sud'
    | 'est'
    | 'ouest'
    | 'sud_est'
    | 'sud_ouest'
    | 'nord_est'
    | 'nord_ouest'
    | 'traversant'
    | null;
  luminosite: string | null;
  hauteur_sous_plafond_m: number | null;
  stationnement:
    | 'aucun'
    | 'place_exterieure'
    | 'place_sous_sol'
    | 'box'
    | 'garage'
    | 'plusieurs'
    | null;
  nb_stationnements: number | null;
  cave: boolean | null;
  cave_surface_m2: number | null;
  terrasse_balcon_m2: number | null;
  jardin_m2: number | null;
  etat_general:
    | 'a_renover'
    | 'rafraichissement'
    | 'bon'
    | 'renove_recemment'
    | 'neuf'
    | null;
  annee_renovation: number | null;
  qualite_renovation: 'superficielle' | 'structurelle' | null;
  meuble: boolean | null;
  meuble_inclus: boolean | null;
  dpe_classe: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | null;
  ges_classe: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | null;
  annee_dpe: number | null;
  etat_copropriete: string | null;
  nombre_lots: number | null;
  charges_annuelles_eur: number | null;
  travaux_votes: boolean | null;
  standing_style: string | null;
  prestations: string[];
  nuisances: string | null;
  motif_vente: string | null;
  delai_souhaite: string | null;
  occupation: 'libre' | 'loue' | 'residence_principale' | null;
  loyer_mensuel_eur: number | null;
  commentaires: string | null;
};

// ─── Field status ─────────────────────────────────────────────────────────────

export type FieldStatus = 'answered' | 'to_confirm' | 'unknown';

export type FieldStatusMap = Partial<Record<keyof PropertyData, FieldStatus>>;

// ─── DVF / Listings / Market ──────────────────────────────────────────────────

export type DvfComparable = {
  id: string;
  date_mutation: string;
  adresse: string;
  code_postal: string;
  ville: string;
  surface_reelle_bati: number | null;
  valeur_fonciere: number;
  prix_m2: number;
  type_local: string;
  nombre_pieces: number | null;
};

export type ListingComparable = {
  id: string;
  source: string;
  url: string | null;
  titre: string;
  prix: number;
  surface_m2: number;
  prix_m2: number;
  nb_pieces: number | null;
  date_publication: string | null;
  statut: 'actif' | 'vendu' | 'retire';
  /** Photo principale de l'annonce (vignette CDN). null si absente. */
  photo_url: string | null;
  /** Géolocalisation de l'annonce (pour la carte de secteur). */
  lat: number | null;
  lon: number | null;
  /** Quartier / secteur tel que renvoyé par la source. */
  quartier: string | null;
};

export type ListingsFetchSource = 'apify' | 'myswarms' | 'none';

export type ListingsFetchResult = {
  listings: ListingComparable[];
  source: ListingsFetchSource;
  rawCount: number;
  filteredCount: number;
  fallbackUsed: boolean;
};

export type MarketAnalysis = {
  zone: string;
  prix_median_m2: number;
  prix_moyen_m2: number;
  nb_transactions_12m: number;
  tendance: 'hausse' | 'stable' | 'baisse';
  delai_moyen_vente_jours: number | null;
  dvf_comparables: DvfComparable[];
  listing_comparables: ListingComparable[];
  listing_source?: ListingsFetchResult;
  /** Géolocalisation du bien estimé (centre de la carte de secteur). */
  subject_lat?: number | null;
  subject_lon?: number | null;
  fetched_at: string;
};

// ─── Valuation ────────────────────────────────────────────────────────────────

export type ValuationAdjustment = {
  label: string;
  type: 'premium' | 'discount';
  pct: number;
  rationale: string;
};

/**
 * Facteurs de confiance mesurables — exposés pour l'explicabilité de l'estimation.
 * Tous dérivés des comparables réellement retenus (déterministe, aucun IO).
 */
export type ConfidenceFactors = {
  /** Nombre de comparables retenus après filtrage. */
  nbComparables: number;
  /** Coefficient de variation des prix/m² indexés (écart-type / médiane). Plus bas = plus fiable. null si <2 comps. */
  cvPrixM2: number | null;
  /** Distance moyenne (km) des comparables au bien. null si aucune géoloc dispo. */
  distanceMoyenneKm: number | null;
  /** Ancienneté moyenne des mutations (mois). null si aucune date exploitable. */
  recenceMoyenneMois: number | null;
};

/** Statut de complétude des données ayant servi au calcul (miroir de la colonne DB). */
export type DataStatus = 'complete' | 'partial' | 'degraded';

export type Valuation = {
  basePerM2: number;
  adjustedPerM2: number;
  adjustments: ValuationAdjustment[];
  lowValue: number;
  marketValue: number;
  highValue: number;
  recommendedListingPrice: number;
  confidence: 'indicative' | 'moyenne' | 'elevee';
  nbComparables: number;
  /** Version du moteur ayant produit cette valorisation (auditabilité). */
  engineVersion: string;
  /** Facteurs de confiance mesurables (explicabilité). */
  confidenceFactors: ConfidenceFactors;
  /** Statut de complétude des données (déterministe, dérivé des comps + géoloc). */
  dataStatus: DataStatus;
};

// ─── Estimation ───────────────────────────────────────────────────────────────

export type EstimationStatus =
  | 'draft'
  | 'interviewing'
  | 'recap'
  | 'valuating'
  | 'ready'
  | 'archived';

export type Estimation = {
  id: string;
  userId: string;
  tenantId: string;
  status: EstimationStatus;
  property: PropertyData;
  fieldStatus: FieldStatusMap;
  market: MarketAnalysis | null;
  valuation: Valuation | null;
  saleStrategies: string[] | null;
  branding: Record<string, unknown> | null;
  /**
   * Provenance honnête des sources (statut LIVE/SNAPSHOT/FALLBACK/UNAVAILABLE
   * par provider), extraite de `sources_snapshot.provenance`. Optionnelle :
   * les estimations pré-provenance restent valides (le PDF retombe alors sur
   * l'affichage de sources statique). Voir lib/estimation/provenance.ts.
   */
  provenance?: ProviderProvenance[] | null;
  createdAt: string;
  updatedAt: string;
};
