/**
 * lib/prospection/crm-link.ts — mapping annonce (prosp_annonces) → lead / bien.
 *
 * Boucle : une annonce de prospection alimente le CRM (lead vendeur + bien), qui
 * sert ensuite de socle à une estimation. Ces fonctions sont PURES et testables :
 * elles ne touchent pas la DB, elles produisent seulement le payload d'insert.
 *
 * Deux invariants :
 *   1. On n'insère QUE les champs réellement présents sur l'annonce — jamais de
 *      valeur inventée, jamais de clé à null qui écraserait un défaut DB.
 *   2. La provenance est toujours marquée "prospection" (source d'origine loguée)
 *      pour tracer d'où vient la donnée CRM et ne jamais la confondre avec une
 *      saisie manuelle confirmée par l'agent.
 */

/**
 * Sous-ensemble des colonnes prosp_annonces utiles au mapping CRM.
 * (database.types.ts est désynchronisé du schéma réel gpu1 : on type le strict
 * nécessaire ici plutôt que de dépendre des types générés.)
 */
export type AnnonceRowLike = {
  id?: string | null;
  source?: string | null;
  type_bien?: string | null;
  titre?: string | null;
  prix?: number | string | null;
  surface?: number | string | null;
  pieces?: number | null;
  chambres?: number | null;
  code_postal?: string | null;
  ville?: string | null;
  dpe?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  url?: string | null;
  nom_annonceur?: string | null;
  email_vendeur?: string | null;
  telephone_vendeur?: string | null;
  type_annonceur?: string | null;
};

/** Provenance CRM des données issues de la prospection. */
export const CRM_PROVENANCE = "prospection" as const;

/** type_bien annonce (texte provider) → property_type CRM canonique. */
const TYPE_BIEN_MAP: Record<string, string> = {
  appartement: "appartement",
  maison: "maison",
  immeuble: "immeuble",
  local: "local_commercial",
  local_commercial: "local_commercial",
  terrain: "terrain",
  parking: "parking",
  autre: "autre",
};

const DPE_LETTERS = new Set(["A", "B", "C", "D", "E", "F", "G"]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function toNum(v: number | string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

/** Payload d'insert lead — uniquement les champs présents. */
export type LeadInsert = {
  full_name: string;
  kind: string;
  source: string;
  email?: string;
  phone?: string;
  type_personne?: string;
};

/**
 * Payload d'insert bien — uniquement les champs présents.
 *
 * Le schéma réel `properties` (0008 + 0039) N'A PAS de colonnes source /
 * source_url / latitude / longitude / dpe_letter dédiées. On mappe donc la
 * provenance, l'URL source et les coordonnées dans `notes` (traçabilité sans
 * casser l'insert), et le DPE reste consigné en note aussi. Seules les colonnes
 * réelles (title, property_type, status, city, postal_code, surface, rooms,
 * bedrooms, asking_price, notes) sont émises comme champs.
 */
export type PropertyInsert = {
  title: string;
  property_type: string;
  status: string;
  city?: string;
  postal_code?: string;
  surface?: number;
  rooms?: number;
  bedrooms?: number;
  asking_price?: number;
  notes?: string;
};

/**
 * mapAnnonceToLead — annonce → lead vendeur.
 *
 * nom_annonceur → full_name (fallback "Vendeur (annonce)" si absent, car
 * full_name est requis côté DB). email_vendeur → email, telephone_vendeur →
 * phone. La provenance ("prospection") va dans `source`. Le vendeur d'une annonce
 * est par nature un `kind:"vendeur"`. N'émet email/phone/type_personne que s'ils
 * existent — pas de clé à null.
 */
export function mapAnnonceToLead(annonce: AnnonceRowLike): LeadInsert {
  const lead: LeadInsert = {
    full_name: isNonEmptyString(annonce.nom_annonceur)
      ? annonce.nom_annonceur.trim()
      : "Vendeur (annonce)",
    kind: "vendeur",
    source: CRM_PROVENANCE,
  };

  if (isNonEmptyString(annonce.email_vendeur)) lead.email = annonce.email_vendeur.trim();
  if (isNonEmptyString(annonce.telephone_vendeur)) lead.phone = annonce.telephone_vendeur.trim();

  // type_annonceur (particulier/pro) → type_personne CRM, seulement si connu.
  if (isNonEmptyString(annonce.type_annonceur)) {
    const t = annonce.type_annonceur.trim().toLowerCase();
    if (t === "particulier") lead.type_personne = "physique";
    else if (t === "professionnel" || t === "pro" || t === "agence") lead.type_personne = "morale";
  }

  return lead;
}

/**
 * mapAnnonceToProperty — annonce → bien CRM.
 *
 * type_bien → property_type (via map canonique), titre → title, prix → asking_price
 * (prix affiché de l'annonce), surface, pieces → rooms, chambres → bedrooms,
 * ville/code_postal → city/postal_code, dpe → dpe_letter, latitude/longitude,
 * url → source_url. Provenance "prospection" dans `source`. `status:"prospect"`
 * (bien en prospection, pas encore mandaté). Champs présents uniquement.
 */
export function mapAnnonceToProperty(annonce: AnnonceRowLike): PropertyInsert {
  const type = isNonEmptyString(annonce.type_bien)
    ? (TYPE_BIEN_MAP[annonce.type_bien.trim().toLowerCase()] ?? "autre")
    : "autre";

  const property: PropertyInsert = {
    title: isNonEmptyString(annonce.titre) ? annonce.titre.trim() : "Bien (annonce)",
    property_type: type,
    status: "prospect",
  };

  if (isNonEmptyString(annonce.ville)) property.city = annonce.ville.trim();
  if (isNonEmptyString(annonce.code_postal)) property.postal_code = annonce.code_postal.trim();

  const surface = toNum(annonce.surface);
  if (surface != null && surface >= 1) property.surface = surface;

  if (annonce.pieces != null) property.rooms = annonce.pieces;
  if (annonce.chambres != null) property.bedrooms = annonce.chambres;

  const prix = toNum(annonce.prix);
  if (prix != null && prix >= 0) property.asking_price = prix;

  // La table properties n'a pas de colonnes dédiées provenance / URL / GPS / DPE :
  // on consigne ces métadonnées dans `notes` pour la traçabilité sans casser
  // l'insert. Provenance ("prospection") toujours en tête.
  const noteParts: string[] = [`Provenance: ${CRM_PROVENANCE}`];
  if (isNonEmptyString(annonce.source)) noteParts.push(`Source: ${annonce.source.trim()}`);
  if (isNonEmptyString(annonce.url)) noteParts.push(`Annonce: ${annonce.url.trim()}`);

  const dpe = isNonEmptyString(annonce.dpe) ? annonce.dpe.trim().toUpperCase() : undefined;
  if (dpe && DPE_LETTERS.has(dpe)) noteParts.push(`DPE: ${dpe}`);

  const lat = toNum(annonce.latitude);
  const lng = toNum(annonce.longitude);
  if (lat != null && lng != null) noteParts.push(`GPS: ${lat},${lng}`);

  property.notes = noteParts.join(" · ");

  return property;
}
