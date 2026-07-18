/**
 * lib/prospection/apify-source.ts
 * Source d'annonces FALLBACK pour la prospection quand MoteurImmo n'est pas
 * configuré. Réutilise le scraper Apify LeBonCoin déjà éprouvé par l'estimation
 * (`fetchListingComparables`) et convertit son format `ListingComparable` vers
 * le format `MoteurImmoListing` attendu par `upsertAnnonces`.
 *
 * Best-effort : jamais throw, [] si Apify absent/vide.
 */
import { apifyIsConfigured, fetchListingComparables } from "@/lib/estimation/listings";
import type { ListingComparable } from "@/lib/estimation/types";
import type { MoteurImmoListing } from "@/lib/providers/moteurimmo";

export function apifyProspectionIsConfigured(): boolean {
  return apifyIsConfigured();
}

/** CP → commune reconnue par LeBonCoin (le scraper Apify cherche par ville). */
const CP_TO_COMMUNE: Record<string, string> = {
  "06600": "Antibes",
  "06160": "Antibes", // Juan-les-Pins
  "06220": "Vallauris", // Golfe-Juan
  "06400": "Cannes",
  "06150": "Cannes", // Cannes-la-Bocca
};

/** Résout une zone (CP ou nom de commune) en ville exploitable par le scraper. */
function zoneToVille(zone: string): { ville: string; codePostal: string | null } {
  const z = zone.trim();
  if (/^\d{5}$/.test(z)) return { ville: CP_TO_COMMUNE[z] ?? z, codePostal: z };
  return { ville: z, codePostal: null };
}

/**
 * Récupère les annonces d'une zone via Apify, au format MoteurImmoListing.
 * `typeBien` (appartement|maison) oriente le scraper ; défaut appartement.
 */
export async function searchListingsApify(
  zone: string,
  typeBien: "appartement" | "maison" = "appartement",
): Promise<MoteurImmoListing[]> {
  if (!apifyIsConfigured()) return [];
  const { ville, codePostal } = zoneToVille(zone);
  const res = await fetchListingComparables({
    ville,
    codePostal,
    typeBien,
    surface: null,
    nbPieces: null,
  });
  return res.listings.map((l) => toMoteurImmo(l, codePostal, ville, typeBien));
}

/**
 * Convertit un `ListingComparable` (sortie du scraper Apify LeBonCoin/Bienici,
 * réutilisé de l'estimation) vers `MoteurImmoListing`. PURE et déterministe.
 * Exportée pour que l'interface gateway `listings.normalize` réutilise EXACTEMENT
 * l'adaptateur qui précède l'ingestion réelle (parité, zéro copie divergente).
 */
export function toMoteurImmo(
  l: ListingComparable,
  codePostal: string | null,
  ville: string,
  typeBien: string,
): MoteurImmoListing {
  return {
    id: l.id,
    typeBien,
    titre: l.titre,
    prix: l.prix,
    surface: l.surface_m2,
    pieces: l.nb_pieces ?? undefined,
    codePostal: codePostal ?? "",
    ville,
    url: l.url ?? undefined,
    photos: [],
    isPap: false,
    datePublication: l.date_publication ?? undefined,
  };
}
