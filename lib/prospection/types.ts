export type PrefSouple = "requis" | "exclu" | "indifferent";

export interface Annonce {
  id: string;
  tenantId: string;
  source: string;
  sourceId: string;
  hashDedup: string;
  typeBien: string;
  titre?: string;
  description?: string;
  prix?: number;
  surface?: number;
  pieces?: number;
  chambres?: number;
  codePostal?: string;
  ville?: string;
  latitude?: number;
  longitude?: number;
  ascenseur?: boolean;
  terrasse?: boolean;
  parking?: boolean;
  jardin?: boolean;
  piscine?: boolean;
  dpe?: string;
  scoreMandat?: number;
  mandatEligible?: boolean;
  scoreBreakdown?: Record<string, number>;
  url?: string;
  photos?: string[];
  isPap: boolean;
  datePublication?: string;
  prixPrecedent?: number;
  republication?: boolean;
}

export interface MandatWeights {
  pap?: number;
  zone_prioritaire?: number;
  republication_recente?: number;
  description_pap?: number;
  anciennete_45j?: number;
  baisse_prix?: number;
}

export interface MandatConfig {
  preset: "api" | "doc" | "custom";
  weights: MandatWeights;
  seuil: number;
  zonesEligibles?: string[];
}

export const PRESETS: Record<"api" | "doc", MandatWeights> = {
  api: { pap: 50, zone_prioritaire: 20, republication_recente: 25, description_pap: 10 },
  doc: { pap: 30, anciennete_45j: 20, baisse_prix: 15, zone_prioritaire: 20 },
};

export const DEFAULT_MANDAT_CONFIG: MandatConfig = {
  preset: "api",
  weights: PRESETS.api,
  seuil: 60,
};

export interface CritereAcquereur {
  id: string;
  tenantId: string;
  userId: string;
  leadId?: string;
  nom: string;
  typeBien?: string[];
  budgetMin?: number;
  budgetMax?: number;
  surfaceMin?: number;
  surfaceMax?: number;
  piecesMin?: number;
  piecesMax?: number;
  zones: string[];
  terrasse: PrefSouple;
  parking: PrefSouple;
  ascenseur: PrefSouple;
  jardin: PrefSouple;
  piscine: PrefSouple;
  dpeMax?: string;
  alerteEmail: boolean;
  alerteWhatsapp: boolean;
  telephone?: string;
  actif: boolean;
}

export interface MatchResult {
  critereId: string;
  annonceId: string;
  score: number;
  breakdown: Record<string, number>;
  features: Record<string, unknown>;
}

export interface IngestStats {
  inserted: number;
  updated: number;
  duplicates: number;
  errors: number;
}
