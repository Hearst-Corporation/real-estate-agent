import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import type { MoteurImmoListing } from "@/lib/providers/moteurimmo";
import type { IngestStats } from "./types";

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

const CHUNK_SIZE = 100;

export async function upsertAnnonces(
  tenantId: string,
  listings: MoteurImmoListing[],
  source: string,
): Promise<IngestStats> {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("supabase_not_configured");

  // updated et duplicates restent à 0 : le batch upsert (ignoreDuplicates:false) ne
  // distingue pas insert vs update au niveau de la réponse. La comptabilisation
  // par-ligne de l'ancienne implémentation était de toute façon approximative.
  const stats: IngestStats = { inserted: 0, updated: 0, duplicates: 0, errors: 0 };

  const now = new Date().toISOString();

  const rows = listings.map((listing) => ({
    tenant_id:        tenantId,
    source_platform:  source,
    source_id:        listing.id,
    hash_dedup:       hashDedup(listing),
    type_bien:        listing.typeBien,
    title:            listing.titre,
    description:      listing.description,
    prix:             listing.prix,
    surface_m2:       listing.surface,
    nb_pieces:        listing.pieces,
    nb_chambres:      listing.chambres,
    code_postal:      listing.codePostal,
    commune:          listing.ville,
    latitude:         listing.latitude,
    longitude:        listing.longitude,
    ascenseur:        listing.ascenseur ?? null,
    terrasse:         listing.terrasse ?? null,
    parking:          listing.parking ?? null,
    jardin:           listing.jardin ?? null,
    piscine:          listing.piscine ?? null,
    dpe_note:         listing.dpe,
    source_url:       listing.url,
    photos_urls:      listing.photos ?? [],
    // CHECK prosp_annonces_type_annonceur_check n'accepte que pap|pro|inconnu (minuscules).
    type_annonceur:   listing.isPap ? "pap" : "pro",
    premiere_parution_at: listing.datePublication,
    prix_original:    listing.prixPrecedent,
    derniere_republication_at: listing.republication ? now : null,
    date_collecte:    now,
  }));

  // A — Dédupliquer intra-batch par hash_dedup (garde la dernière occurrence).
  // Doublons retirés → stats.duplicates (leur vraie sémantique : annonces vues
  // plusieurs fois dans le même scrape, pas des conflits DB).
  const dedupMap = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    dedupMap.set(row.hash_dedup, row);
  }
  stats.duplicates = rows.length - dedupMap.size;
  const dedupedRows = Array.from(dedupMap.values());

  for (let i = 0; i < dedupedRows.length; i += CHUNK_SIZE) {
    const chunk = dedupedRows.slice(i, i + CHUNK_SIZE);
    try {
      const { data, error } = await db
        .from("prosp_annonces")
        .upsert(chunk, { onConflict: "tenant_id,hash_dedup", ignoreDuplicates: false })
        .select("id");

      if (!error) {
        // Happy-path : tout le chunk est passé en un seul statement.
        stats.inserted += data?.length ?? 0;
      } else {
        // B — Fallback per-ligne : re-tente chaque ligne individuellement pour
        // ne compter en errors que les lignes réellement fautives.
        for (const row of chunk) {
          try {
            const { data: d, error: e } = await db
              .from("prosp_annonces")
              .upsert(row, { onConflict: "tenant_id,hash_dedup", ignoreDuplicates: false })
              .select("id")
              .single();
            if (e) {
              stats.errors += 1;
            } else if (d) {
              stats.inserted += 1;
            }
          } catch {
            stats.errors += 1;
          }
        }
      }
    } catch {
      // Exception réseau / timeout sur le chunk entier → fallback per-ligne.
      for (const row of chunk) {
        try {
          const { data: d, error: e } = await db
            .from("prosp_annonces")
            .upsert(row, { onConflict: "tenant_id,hash_dedup", ignoreDuplicates: false })
            .select("id")
            .single();
          if (e) {
            stats.errors += 1;
          } else if (d) {
            stats.inserted += 1;
          }
        } catch {
          stats.errors += 1;
        }
      }
    }
  }

  return stats;
}
