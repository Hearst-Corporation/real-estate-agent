/**
 * lib/estimation/listings.ts
 * Comparables d'ANNONCES en cours (listing_comparables).
 *
 * Source PRIMAIRE : Apify — actor `leadsbrary/leboncoin-real-estate-scraper`
 * (params structurés : keywords/city/surfaceMin/Max/roomsMin/maxAds ; ~7s/run).
 * Appel via `run-sync-get-dataset-items` (synchrone, renvoie directement les items).
 *
 * Fallback : engine MySwarms `POST /v1/listings` (scraper Browserbase synchrone)
 *   si `MYSWARMS_ENGINE_URL` + `_TOKEN` configurés ET Apify absent/vide.
 *
 * Toujours best-effort : jamais throw, timeout strict, fallback [] — la
 * valorisation DVF ne dépend jamais des annonces.
 */
import type { ListingComparable } from "./types";

// ─── Config ──────────────────────────────────────────────────────────────────

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_ACTOR = process.env.APIFY_LISTINGS_ACTOR; // ex: Rhe6hf9xgPofMjN8i

const MYSWARMS_BASE = process.env.MYSWARMS_ENGINE_URL;
const MYSWARMS_TOKEN = process.env.MYSWARMS_ENGINE_TOKEN;

const SOURCE_LEBONCOIN = "leboncoin";
const SOURCE_BIENICI = "bienici";

const APIFY_TIMEOUT_MS = 40000; // cap dur (maxDuration route = 60s)
const MYSWARMS_TIMEOUT_MS = 15000; // best-effort : scraper Browserbase synchrone côté engine
const MAX_LISTINGS = 12;

export type ListingsQuery = {
  ville: string | null;
  codePostal: string | null;
  typeBien: string | null;
  surface: number | null;
  nbPieces: number | null;
};

export function apifyIsConfigured(): boolean {
  return Boolean(APIFY_TOKEN && APIFY_ACTOR);
}

export function myswarmsIsConfigured(): boolean {
  return Boolean(MYSWARMS_BASE && MYSWARMS_TOKEN);
}

export function listingsIsConfigured(): boolean {
  return apifyIsConfigured() || myswarmsIsConfigured();
}

/**
 * Point d'entrée unique consommé par /value. Apify en priorité, MySwarms en
 * secours, [] sinon. Jamais throw.
 */
export async function fetchListingComparables(q: ListingsQuery): Promise<ListingComparable[]> {
  if (apifyIsConfigured()) {
    const apify = await fetchViaApify(q);
    if (apify.length > 0) return apify;
    // Apify a répondu vide → on tente MySwarms si dispo, sinon [].
  }
  if (myswarmsIsConfigured()) return fetchViaMyswarms(q);
  return [];
}

// ─── Helpers communs ───────────────────────────────────────────────────────

async function timedFetch(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function mapStatut(raw: unknown): ListingComparable["statut"] {
  const s = typeof raw === "string" ? raw.toLowerCase() : "";
  if (s.includes("sold") || s.includes("vendu")) return "vendu";
  if (s.includes("expired") || s.includes("retir") || s.includes("inactive")) return "retire";
  return "actif";
}

// ─── Apify (LeBonCoin real-estate) ───────────────────────────────────────────

// Localités qui ne sont pas des communes LeBonCoin → commune mère qui les couvre.
// (extensible : Cannes-la-Bocca→Cannes, Golfe-Juan→Vallauris, etc.)
const LOCALITY_TO_COMMUNE: Record<string, string> = {
  "juan les pins": "Antibes",
  "golfe juan": "Vallauris",
};

/** Normalise une ville/localité vers la commune reconnue par LeBonCoin. */
function normalizeListingCity(ville: string | null, codePostal: string | null): string | null {
  if (codePostal === "06160") return "Antibes"; // Juan-les-Pins = commune d'Antibes
  if (!ville) return null;
  const key = ville
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (key.includes("juan")) return "Antibes";
  return LOCALITY_TO_COMMUNE[key] ?? ville;
}

function buildApifyInput(q: ListingsQuery): Record<string, unknown> {
  const input: Record<string, unknown> = {
    keywords: q.typeBien === "maison" ? "maison" : "appartement",
    maxAds: MAX_LISTINGS * 2, // on en demande plus car on filtre les locations en sortie
    radius: 8000,
    delay: 1,
  };
  // LeBonCoin préfère le nom de commune seul (pas de CP accolé), et certaines
  // localités (Juan-les-Pins) doivent passer par leur commune (Antibes).
  const city = normalizeListingCity(q.ville, q.codePostal);
  if (city) input.city = city;
  if (q.surface && q.surface > 0) {
    input.surfaceMin = Math.round(q.surface * 0.7);
    input.surfaceMax = Math.round(q.surface * 1.3);
  }
  if (q.nbPieces && q.nbPieces > 1) input.roomsMin = q.nbPieces - 1;
  return input;
}

async function fetchViaApify(q: ListingsQuery): Promise<ListingComparable[]> {
  if (!q.ville) return []; // sans ville, recherche inutile
  try {
    const url =
      `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items` +
      `?token=${APIFY_TOKEN}&maxItems=${MAX_LISTINGS}`;
    const res = await timedFetch(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildApifyInput(q)),
      },
      APIFY_TIMEOUT_MS,
    );
    if (!res.ok) return [];
    const data: unknown = await res.json().catch(() => null);
    const items = Array.isArray(data) ? data : [];
    return normalizeApify(items);
  } catch {
    return [];
  }
}

function normalizeApify(items: unknown[], source: string = SOURCE_LEBONCOIN): ListingComparable[] {
  const out: ListingComparable[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = asRecord(items[i]);
    if (!it) continue;
    const prix = num(it.price_eur ?? it.price ?? it.prix);
    const surface = num(it.surface_m2 ?? it.surface);
    // exclut les LOCATIONS (loyers mensuels) : aucune vente d'appartement < 30k€
    if (prix == null || prix < 30000 || surface == null || surface <= 0) continue;
    const saleType = String(it.sale_type ?? it.ad_type ?? it.category ?? "").toLowerCase();
    if (saleType.includes("location") || saleType.includes("rent") || saleType.includes("loue")) continue;
    const ppm2 = num(it.price_per_sqm);
    out.push({
      id: str(it.id) ?? `lbc-${i}`,
      source,
      url: str(it.url),
      titre: str(it.title ?? it.titre) ?? "Annonce",
      prix,
      surface_m2: surface,
      prix_m2: ppm2 && ppm2 > 0 ? ppm2 : Math.round(prix / surface),
      nb_pieces: num(it.rooms ?? it.pieces),
      date_publication: str(it.published_at ?? it.date),
      statut: mapStatut(it.status),
    });
  }
  return out.slice(0, MAX_LISTINGS);
}

// ─── Engine MySwarms (POST /v1/listings — scraper Browserbase synchrone) ──────

async function fetchViaMyswarms(q: ListingsQuery): Promise<ListingComparable[]> {
  try {
    const res = await timedFetch(
      `${MYSWARMS_BASE}/v1/listings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MYSWARMS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(q),
      },
      MYSWARMS_TIMEOUT_MS,
    );
    if (!res.ok) return [];
    const raw: unknown = await res.json().catch(() => null);
    const rec = asRecord(raw);
    return normalizeApify(arrayOf(rec?.listings ?? raw), SOURCE_BIENICI);
  } catch {
    return [];
  }
}

function arrayOf(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  const r = asRecord(v);
  return Array.isArray(r?.listings) ? (r!.listings as unknown[]) : [];
}
