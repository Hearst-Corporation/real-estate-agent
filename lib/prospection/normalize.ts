/**
 * lib/prospection/normalize.ts — NORMALISATION PURE multi-sources d'annonces
 * brutes vers le schéma canonique `prosp_annonces`, SANS AUCUNE PERSISTANCE.
 *
 * Pourquoi c'est honnête (et non une normalisation fabriquée) :
 *   - Elle n'invente RIEN. Elle COMPOSE les fonctions déjà utilisées par
 *     l'ingestion réelle et l'estimation, dans le même ordre :
 *       1. parse BRUT → `MoteurImmoListing`, par source :
 *          · moteurimmo  → `normalizeMoteurImmo` (le parser de `searchListings`) ;
 *          · leboncoin / bienici → `normalizeApify` (parser d'estimation) puis
 *            `toMoteurImmo` (l'adaptateur exact d'`apify-source`, chemin
 *            prospection réel avant `upsertAnnonces`).
 *       2. `MoteurImmoListing` → ligne canonique via `toAnnonceRow` — LA MÊME
 *          fonction que `upsertAnnonces` appelle pour écrire (mappers.ts). La
 *          parité avec l'ingestion est garantie PAR CONSTRUCTION (code partagé),
 *          pas par une seconde implémentation à tenir synchronisée.
 *   - `hash_dedup` est calculé par `hashDedup` (idem ingestion) → l'empreinte de
 *     déduplication d'un bien normalisé ici est identique à celle qu'il aurait en
 *     base. Déterministe : `nowIso` est injecté (aucune horloge implicite).
 *   - AUCUN accès DB, AUCUN client GPU1, AUCUN réseau. On retourne l'objet
 *     ligne + le hash ; on n'écrit jamais. `tenant_id` est intégré à la ligne
 *     mais aucune donnée d'un tenant n'est lue/écrite.
 *
 * Sources reconnues : `moteurimmo`, `leboncoin` (alias `apify_lbc`), `bienici`.
 * Une source inconnue lève `UnknownSourceError` (fail-closed, jamais un parse au
 * hasard). Une entrée non-objet est ignorée (comptée `skipped`).
 */
import { normalizeMoteurImmo } from "@/lib/providers/moteurimmo";
import { normalizeApify } from "@/lib/estimation/listings";
import { toMoteurImmo } from "@/lib/prospection/apify-source";
import { toAnnonceRow, hashDedup, type AnnonceInsert } from "@/lib/prospection/mappers";
import type { MoteurImmoListing } from "@/lib/providers/moteurimmo";

/** Sources d'ingestion supportées par la normalisation (canoniques + alias). */
export type NormalizeSource = "moteurimmo" | "leboncoin" | "apify_lbc" | "bienici";

const KNOWN_SOURCES: ReadonlySet<string> = new Set<NormalizeSource>([
  "moteurimmo",
  "leboncoin",
  "apify_lbc",
  "bienici",
]);

/** `source` normalisée telle qu'écrite dans `prosp_annonces.source`. */
function canonicalSource(source: string): string {
  // `leboncoin` et `apify_lbc` désignent le même flux (scraper Apify LBC) ; on
  // conserve `apify_lbc` comme valeur de colonne (cohérent avec listings.collect).
  if (source === "leboncoin") return "apify_lbc";
  return source;
}

export class UnknownSourceError extends Error {
  constructor(public readonly source: string) {
    super(`unknown_source:${source}`);
    this.name = "UnknownSourceError";
  }
}

export function isKnownNormalizeSource(source: string): boolean {
  return KNOWN_SOURCES.has(source);
}

/** Une ligne normalisée (canonique) + son empreinte de dédup. */
export interface NormalizedListing {
  row: AnnonceInsert;
  hashDedup: string;
}

export interface NormalizeResult {
  source: string;
  normalized: NormalizedListing[];
  /** Entrées ignorées (non-objet / non parsables en `MoteurImmoListing`). */
  skipped: number;
}

/**
 * Parse une liste d'items BRUTS d'une source vers `MoteurImmoListing[]`, en
 * réutilisant le parser RÉEL de chaque source. Pure. Les items ininterprétables
 * (sans identité exploitable) sont écartés.
 */
export function parseRawListings(source: string, rawItems: unknown[]): MoteurImmoListing[] {
  if (!isKnownNormalizeSource(source)) throw new UnknownSourceError(source);

  if (source === "moteurimmo") {
    return rawItems
      .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
      .map((it) => normalizeMoteurImmo(it))
      // Un item sans identité (ni id ni reference) n'est pas une annonce exploitable.
      .filter((l) => l.id.length > 0);
  }

  // leboncoin / apify_lbc / bienici : dataset Apify → ListingComparable → MoteurImmoListing.
  const apifySource = source === "bienici" ? "bienici" : "leboncoin";
  const comparables = normalizeApify(rawItems, apifySource);
  return comparables.map((c) =>
    toMoteurImmo(
      c,
      c.quartier && /^\d{5}$/.test(c.quartier) ? c.quartier : null,
      c.quartier ?? "",
      // `ListingComparable` ne porte pas de type_bien fiable → défaut appartement,
      // cohérent avec le chemin prospection (searchListingsApify défaut appartement).
      "appartement",
    ),
  );
}

/**
 * Normalise des annonces BRUTES d'une source vers des lignes canoniques
 * `prosp_annonces`, sans persister. Déterministe : `nowIso` fixe l'horodatage
 * (`updated_at`) exactement comme `upsertAnnonces` fige son `now` par batch.
 *
 * @param tenantId  tenant DÉRIVÉ DE L'AUTH côté gateway (jamais du payload brut).
 * @param source    source d'ingestion (moteurimmo|leboncoin|apify_lbc|bienici).
 * @param rawItems  items bruts tels que renvoyés par la source.
 * @param nowIso    horodatage figé (batch cohérent / tests déterministes).
 */
export function normalizeListings(
  tenantId: string,
  source: string,
  rawItems: unknown[],
  nowIso: string,
): NormalizeResult {
  if (!isKnownNormalizeSource(source)) throw new UnknownSourceError(source);
  const col = canonicalSource(source);
  const parsed = parseRawListings(source, rawItems);
  const normalized: NormalizedListing[] = parsed.map((listing) => {
    const row = toAnnonceRow(tenantId, col, listing, nowIso);
    return { row, hashDedup: row.hash_dedup };
  });
  return {
    source: col,
    normalized,
    skipped: rawItems.length - parsed.length,
  };
}

// Ré-export pour les tests de parité (mêmes fonctions que l'ingestion).
export { toAnnonceRow, hashDedup };
