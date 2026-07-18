import { paidCall } from "./cost-guard";

export interface MoteurImmoListing {
  id: string;
  typeBien: string;
  titre?: string;
  description?: string;
  prix?: number;
  surface?: number;
  pieces?: number;
  chambres?: number;
  codePostal?: string;
  ville?: string;
  departement?: string;
  latitude?: number;
  longitude?: number;
  etage?: number;
  ascenseur?: boolean;
  terrasse?: boolean;
  parking?: boolean;
  jardin?: boolean;
  piscine?: boolean;
  dpe?: string;
  anneeConstruction?: number;
  url?: string;
  photos?: string[];
  isPap?: boolean;
  datePublication?: string;
  dateModif?: string;
  prixPrecedent?: number;
  republication?: boolean;
}

interface SearchParams {
  codePostal: string;
  typeBien?: string;
  prixMax?: number;
  surfaceMin?: number;
  page?: number;
  perPage?: number;
}

const BASE = "https://api.moteurimmo.fr/v1";

export function moteurImmoIsConfigured(): boolean {
  return Boolean(process.env.MOTEURIMMO_API_KEY);
}

export async function searchListings(params: SearchParams): Promise<MoteurImmoListing[]> {
  if (!moteurImmoIsConfigured()) return [];

  const result = await paidCall(
    "moteurimmo",
    `search:${params.codePostal}:${params.page ?? 1}`,
    async () => {
      const qs = new URLSearchParams({
        cp: params.codePostal,
        ...(params.typeBien ? { type: params.typeBien } : {}),
        ...(params.prixMax ? { prix_max: String(params.prixMax) } : {}),
        ...(params.surfaceMin ? { surface_min: String(params.surfaceMin) } : {}),
        page: String(params.page ?? 1),
        per_page: String(params.perPage ?? 50),
      });
      const res = await fetch(`${BASE}/annonces?${qs}`, {
        headers: { Authorization: `Bearer ${process.env.MOTEURIMMO_API_KEY}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`MoteurImmo ${res.status}: ${detail}`);
      }
      const data = (await res.json()) as { annonces?: unknown[] };
      return (data.annonces ?? []).map(normalizeMoteurImmo);
    },
    { ttlSec: 3600, dailyCap: 100 },
  );
  return result.ok ? result.data : [];
}

/**
 * Normalise un item BRUT de l'API MoteurImmo vers `MoteurImmoListing`. PURE et
 * déterministe (aucun IO, aucune horloge). Exportée pour être RÉUTILISÉE par
 * l'interface gateway `listings.normalize` — la même fonction qui alimente
 * `searchListings` ci-dessus (donc l'ingestion réelle), pas une copie divergente.
 */
export function normalizeMoteurImmo(raw: unknown): MoteurImmoListing {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? r.reference ?? ""),
    typeBien: String(r.type_bien ?? r.typeBien ?? "appartement").toLowerCase(),
    titre: (r.titre ?? r.title) as string | undefined,
    description: (r.description ?? r.desc) as string | undefined,
    prix: toNum(r.prix ?? r.price),
    surface: toNum(r.surface ?? r.surface_habitable),
    pieces: toInt(r.pieces ?? r.nb_pieces),
    chambres: toInt(r.chambres ?? r.nb_chambres),
    codePostal: String(r.code_postal ?? r.cp ?? ""),
    ville: (r.ville ?? r.city) as string | undefined,
    departement: (r.departement ?? r.dept) as string | undefined,
    latitude: toNum(r.latitude ?? r.lat),
    longitude: toNum(r.longitude ?? r.lng ?? r.lon),
    etage: toInt(r.etage ?? r.floor),
    ascenseur: toBool(r.ascenseur ?? r.elevator),
    terrasse: toBool(r.terrasse ?? r.terrace),
    parking: toBool(r.parking),
    jardin: toBool(r.jardin ?? r.garden),
    piscine: toBool(r.piscine ?? r.pool),
    dpe: (r.dpe ?? r.classe_energie) as string | undefined,
    anneeConstruction: toInt(r.annee_construction ?? r.year_built),
    url: (r.url ?? r.link) as string | undefined,
    photos: Array.isArray(r.photos) ? r.photos.map(String) : [],
    isPap: Boolean(r.is_pap ?? r.pap ?? false),
    datePublication: (r.date_publication ?? r.created_at) as string | undefined,
    dateModif: (r.date_modif ?? r.updated_at) as string | undefined,
    prixPrecedent: toNum(r.prix_precedent ?? r.old_price),
    republication: Boolean(r.republication ?? false),
  };
}

function toNum(v: unknown): number | undefined {
  const n = Number(v);
  return isNaN(n) || v == null ? undefined : n;
}
function toInt(v: unknown): number | undefined {
  const n = parseInt(String(v), 10);
  return isNaN(n) ? undefined : n;
}
function toBool(v: unknown): boolean | undefined {
  if (v == null) return undefined;
  return Boolean(v);
}
