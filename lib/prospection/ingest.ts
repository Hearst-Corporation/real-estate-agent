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

export async function upsertAnnonces(
  tenantId: string,
  listings: MoteurImmoListing[],
  source: string,
): Promise<IngestStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseAdmin() as any;
  if (!db) throw new Error("supabase_not_configured");

  const stats: IngestStats = { inserted: 0, updated: 0, duplicates: 0, errors: 0 };

  for (const listing of listings) {
    try {
      const hash = hashDedup(listing);
      const row = {
        tenant_id:        tenantId,
        source_platform:  source,
        source_id:        listing.id,
        hash_dedup:       hash,
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
        type_annonceur:   listing.isPap ? "PAP" : "PRO",
        premiere_parution_at: listing.datePublication,
        prix_original:    listing.prixPrecedent,
        derniere_republication_at: listing.republication ? new Date().toISOString() : null,
        date_collecte:    new Date().toISOString(),
      };

      const { data, error } = await db
        .from("prosp_annonces")
        .upsert(row, { onConflict: "tenant_id,hash_dedup", ignoreDuplicates: false })
        .select("id")
        .single();

      if (error) {
        stats.errors++;
      } else if (data) {
        stats.inserted++;
      } else {
        stats.duplicates++;
      }
    } catch {
      stats.errors++;
    }
  }

  return stats;
}
