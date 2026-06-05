/**
 * lib/estimation/snapshot.ts — Construit le snapshot des sources (A4).
 *
 * PURE, sans IO. Capé en taille : le cap 2 MiB de safeFetch est PAR fetch, pas
 * pour l'agrégat — un snapshot DVF multi-section + Apify peut exploser. On borne
 * donc le nombre d'échantillons puis la taille sérialisée totale.
 *
 * Données stockées : DVF (open data anonymisée), géo/cadastre (lat/lon/INSEE,
 * non nominatif), classe DPE, listings normalisés. Pas de données nominatives.
 */

const MAX_SAMPLE = 50;
const MAX_BYTES = 512 * 1024; // 512 KB sérialisés

export interface SnapshotInput {
  adresse?: string | null;
  geo?: unknown;
  parcelle?: unknown;
  sections?: string[];
  mutations?: unknown[];
  dpeClasse?: string | null;
  listings?: unknown[];
}

export interface SourcesSnapshot {
  fetched_at: string;
  adresse: string | null;
  geo: unknown;
  parcelle: unknown;
  sections: string[];
  dvf: { count: number; sample: unknown[] };
  ademe: { classe: string | null };
  listings: { count: number; sample: unknown[] };
  truncated: boolean;
}

function size(obj: unknown): number {
  return JSON.stringify(obj).length;
}

export function buildSourcesSnapshot(input: SnapshotInput, fetchedAt: string): SourcesSnapshot {
  const mutations = input.mutations ?? [];
  const listings = input.listings ?? [];

  const snap: SourcesSnapshot = {
    fetched_at: fetchedAt,
    adresse: input.adresse ?? null,
    geo: input.geo ?? null,
    parcelle: input.parcelle ?? null,
    sections: input.sections ?? [],
    dvf: { count: mutations.length, sample: mutations.slice(0, MAX_SAMPLE) },
    ademe: { classe: input.dpeClasse ?? null },
    listings: { count: listings.length, sample: listings.slice(0, MAX_SAMPLE) },
    truncated: false,
  };

  // Réduction progressive si trop volumineux (les counts sont toujours conservés).
  if (size(snap) > MAX_BYTES) {
    snap.dvf.sample = [];
    snap.truncated = true;
  }
  if (size(snap) > MAX_BYTES) {
    snap.listings.sample = [];
    snap.truncated = true;
  }

  return snap;
}
