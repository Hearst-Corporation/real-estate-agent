/**
 * lib/prospection/mappers.ts — convertit une ligne DB Supabase (snake_case,
 * colonnes nullables) vers les types métier `Annonce` / `CritereAcquereur`.
 *
 * Source unique partagée par le cron `prospScoring` (lib/jobs/inngest) ET le
 * scraping personnalisé à la demande (lib/prospection/scrape-custom). Évite de
 * dupliquer la logique de mapping (et ses pièges de fallback de colonnes).
 *
 * ⚠️ SCHÉMA RÉEL gpu1 (migration 0015, vérifié via PostgREST) : la table
 * `prosp_annonces` utilise `source`, `titre`, `surface`, `pieces`, `ville`,
 * `is_pap`, `date_publication`, `prix_precedent`, `republication`, `photos`,
 * `raw` — PAS les noms historiques (`source_platform`, `title`, `surface_m2`…)
 * qui traînent encore dans `database.types.ts`. Les lectures gardent un
 * fallback `?? bon_nom` par sécurité ; les ÉCRITURES (toAnnonceRow) écrivent
 * exclusivement les vraies colonnes.
 */
import { createHash } from "node:crypto";
import type { MoteurImmoListing } from "@/lib/providers/moteurimmo";
import type { TablesInsert } from "@/lib/gpu1/database.types";
import type { Annonce, CritereAcquereur } from "./types";

export type AnnonceInsert = TablesInsert<"prosp_annonces">;

/** Empreinte de déduplication : type + CP + surface (pas 5) + pièces + prix (pas 5000). */
export function hashDedup(l: MoteurImmoListing): string {
  const key = [
    l.typeBien,
    l.codePostal ?? "",
    String(Math.round((l.surface ?? 0) / 5) * 5),
    String(l.pieces ?? 0),
    String(Math.round((l.prix ?? 0) / 5000) * 5000),
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/**
 * Mappe une annonce provider vers une ligne d'INSERT `prosp_annonces` au SCHÉMA
 * RÉEL. `nowIso` fige l'horodatage (batch cohérent / tests déterministes).
 */
export function toAnnonceRow(
  tenantId: string,
  source: string,
  listing: MoteurImmoListing,
  nowIso: string = new Date().toISOString(),
): AnnonceInsert {
  return {
    tenant_id: tenantId,
    source,
    source_id: listing.id,
    hash_dedup: hashDedup(listing),
    type_bien: listing.typeBien,
    titre: listing.titre ?? null,
    description: listing.description ?? null,
    prix: listing.prix ?? null,
    surface: listing.surface ?? null,
    pieces: listing.pieces ?? null,
    chambres: listing.chambres ?? null,
    code_postal: listing.codePostal ?? null,
    ville: listing.ville ?? null,
    departement: listing.departement ?? null,
    latitude: listing.latitude ?? null,
    longitude: listing.longitude ?? null,
    etage: listing.etage ?? null,
    ascenseur: listing.ascenseur ?? null,
    terrasse: listing.terrasse ?? null,
    parking: listing.parking ?? null,
    jardin: listing.jardin ?? null,
    piscine: listing.piscine ?? null,
    dpe: listing.dpe ?? null,
    annee_construction: listing.anneeConstruction ?? null,
    url: listing.url ?? null,
    photos: (listing.photos ?? []) as AnnonceInsert["photos"],
    raw: listing as unknown as AnnonceInsert["raw"],
    is_pap: listing.isPap ?? false,
    date_publication: listing.datePublication ?? null,
    date_modif: listing.dateModif ?? null,
    prix_precedent: listing.prixPrecedent ?? null,
    republication: listing.republication ?? false,
    updated_at: nowIso,
  };
}

export function dbRowToAnnonce(row: Record<string, unknown>): Annonce {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    source: String(row.source_platform ?? row.source ?? ""),
    sourceId: String(row.source_id),
    hashDedup: String(row.hash_dedup),
    typeBien: String(row.type_bien),
    titre: (row.title ?? row.titre) as string | undefined,
    description: row.description as string | undefined,
    prix: row.prix as number | undefined,
    surface: (row.surface_m2 ?? row.surface) as number | undefined,
    pieces: (row.nb_pieces ?? row.pieces) as number | undefined,
    codePostal: row.code_postal as string | undefined,
    ville: (row.commune ?? row.ville) as string | undefined,
    latitude: row.latitude as number | undefined,
    longitude: row.longitude as number | undefined,
    ascenseur: row.ascenseur as boolean | undefined,
    terrasse: row.terrasse as boolean | undefined,
    parking: row.parking as boolean | undefined,
    jardin: row.jardin as boolean | undefined,
    piscine: row.piscine as boolean | undefined,
    dpe: (row.dpe_note ?? row.dpe) as string | undefined,
    url: (row.source_url ?? row.url) as string | undefined,
    photos: (row.photos_urls ?? row.photos) as string[] | undefined,
    isPap:
      typeof row.is_pap === "boolean"
        ? row.is_pap
        : String(row.type_annonceur ?? "").toLowerCase() === "pap",
    datePublication: (row.premiere_parution_at ?? row.date_publication) as string | undefined,
    prixPrecedent: (row.prix_original ?? row.prix_precedent) as number | undefined,
    republication:
      typeof row.republication === "boolean"
        ? row.republication
        : row.derniere_republication_at != null,
  };
}

export function dbRowToCritere(row: Record<string, unknown>): CritereAcquereur {
  const pref = (v: unknown) =>
    (["requis", "exclu"].includes(String(v)) ? (String(v) as "requis" | "exclu") : "indifferent");
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    leadId: row.lead_id as string | undefined,
    nom: String(row.nom),
    typeBien: row.type_bien as string[] | undefined,
    budgetMin: row.budget_min as number | undefined,
    budgetMax: row.budget_max as number | undefined,
    surfaceMin: row.surface_min as number | undefined,
    surfaceMax: row.surface_max as number | undefined,
    piecesMin: row.pieces_min as number | undefined,
    piecesMax: row.pieces_max as number | undefined,
    zones: Array.isArray(row.zones) ? row.zones.map(String) : [],
    terrasse: pref(row.terrasse),
    parking: pref(row.parking),
    ascenseur: pref(row.ascenseur),
    jardin: pref(row.jardin),
    piscine: pref(row.piscine),
    dpeMax: row.dpe_max as string | undefined,
    alerteEmail: Boolean(row.alerte_email),
    alerteWhatsapp: Boolean(row.alerte_whatsapp),
    telephone: row.telephone as string | undefined,
    actif: Boolean(row.actif),
  };
}
