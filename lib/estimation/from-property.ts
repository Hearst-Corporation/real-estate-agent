import { PropertyDataSchema, type PropertyDataInput } from "@/lib/estimation/schema";

// ─── Mapping bien CRM (row properties) → PropertyData de préremplissage ───────
//
// N'insère QUE les champs réellement présents sur le bien (pas d'invention).
// La sortie est validée par PropertyDataSchema : tout champ non conforme (ex.
// enum inattendu) est écarté par le parse plutôt que de casser la création.

/** Sous-ensemble des colonnes properties utiles au préremplissage. */
export type PropertyRowLike = {
  property_type?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  surface?: number | string | null;
  rooms?: number | null;
  bedrooms?: number | null;
  floor?: number | null;
  floor_total?: number | null;
  has_elevator?: boolean | null;
  charges_monthly?: number | string | null;
  cellar?: boolean | null;
  dpe_letter?: string | null;
  ges_letter?: string | null;
  orientation?: string | null;
  parking_count?: number | null;
};

/** property_type CRM (texte libre, clés canoniques du formulaire) → enum PropertyData. */
const TYPE_MAP: Record<string, PropertyDataInput["type_bien"]> = {
  appartement: "appartement",
  maison: "maison",
  immeuble: "immeuble",
  local: "local_commercial",
  local_commercial: "local_commercial",
  terrain: "terrain",
  autre: "autre",
};

/** orientation CRM → enum exposition PropertyData (mêmes clés admises). */
const ORIENTATION_MAP: Record<string, PropertyDataInput["exposition"]> = {
  nord: "nord",
  sud: "sud",
  est: "est",
  ouest: "ouest",
  sud_est: "sud_est",
  sud_ouest: "sud_ouest",
  nord_est: "nord_est",
  nord_ouest: "nord_ouest",
  traversant: "traversant",
};

const DPE_LETTERS = new Set(["A", "B", "C", "D", "E", "F", "G"]);

function toNum(v: number | string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

export function propertyRowToPropertyData(row: PropertyRowLike): PropertyDataInput {
  const draft: Record<string, unknown> = {};

  const type = row.property_type ? TYPE_MAP[row.property_type.toLowerCase()] : undefined;
  if (type) draft.type_bien = type;

  if (row.address) draft.adresse = row.address;
  if (row.city) draft.ville = row.city;
  if (row.postal_code) draft.code_postal = row.postal_code;

  const surface = toNum(row.surface);
  if (surface != null && surface >= 1) draft.surface_habitable_m2 = surface;

  if (row.rooms != null) draft.nombre_pieces = row.rooms;
  if (row.bedrooms != null) draft.nombre_chambres = row.bedrooms;
  if (row.floor != null) draft.etage = row.floor;
  if (row.floor_total != null) draft.nb_etages_total = row.floor_total;
  if (typeof row.has_elevator === "boolean") draft.ascenseur = row.has_elevator;
  if (typeof row.cellar === "boolean") draft.cave = row.cellar;
  if (row.parking_count != null) draft.nb_stationnements = row.parking_count;

  const charges = toNum(row.charges_monthly);
  // charges CRM = mensuelles → PropertyData attend un montant annuel.
  if (charges != null && charges >= 0) draft.charges_annuelles_eur = Math.round(charges * 12);

  const dpe = row.dpe_letter?.toUpperCase();
  if (dpe && DPE_LETTERS.has(dpe)) draft.dpe_classe = dpe;
  const ges = row.ges_letter?.toUpperCase();
  if (ges && DPE_LETTERS.has(ges)) draft.ges_classe = ges;

  const exposition = row.orientation ? ORIENTATION_MAP[row.orientation.toLowerCase()] : undefined;
  if (exposition) draft.exposition = exposition;

  // Le parse écarte tout champ hors bornes/enum plutôt que de casser la création.
  const parsed = PropertyDataSchema.safeParse(draft);
  return parsed.success ? parsed.data : {};
}
