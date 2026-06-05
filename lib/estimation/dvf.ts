import { safeFetch } from './safe-fetch';
import { ENDPOINTS } from './endpoints';

export type DvfMutation = {
  valeur_fonciere: number;
  type_local: string;
  surface_reelle_bati: number;
  nombre_pieces_principales: number | null;
  date_mutation: string;
  latitude: number | null;
  longitude: number | null;
  id_parcelle: string;
};

function isValidNumber(v: unknown): v is number {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') {
    if (v === 'nan' || v.trim() === '') return false;
    const n = Number(v);
    return !isNaN(n) && n > 0;
  }
  if (typeof v === 'number') return !isNaN(v) && v > 0;
  return false;
}

function coerceNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  return Number(v);
}

function coerceNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && (v === 'nan' || v.trim() === '')) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMutation(raw: any): DvfMutation | null {
  const vf = raw?.valeur_fonciere;
  const surf = raw?.surface_reelle_bati;

  if (!isValidNumber(vf) || !isValidNumber(surf)) return null;

  const type_local: string = raw?.type_local ?? '';
  const nombre_pieces_principales = coerceNullableNumber(raw?.nombre_pieces_principales);
  const date_mutation: string = raw?.date_mutation ?? '';
  const latitude = coerceNullableNumber(raw?.latitude);
  const longitude = coerceNullableNumber(raw?.longitude);
  const id_parcelle: string = raw?.id_parcelle ?? '';

  return {
    valeur_fonciere: coerceNumber(vf),
    type_local,
    surface_reelle_bati: coerceNumber(surf),
    nombre_pieces_principales,
    date_mutation,
    latitude,
    longitude,
    id_parcelle,
  };
}

export async function fetchMutations(
  codeCommune: string,
  sectionPrefixee: string,
): Promise<DvfMutation[]> {
  const url = `${ENDPOINTS.DVF}/${encodeURIComponent(codeCommune)}/${encodeURIComponent(sectionPrefixee)}`;

  try {
    // 12 Mo : les sections cadastrales denses (Cannes/Antibes/Paris…) dépassent
    // le défaut 2 Mo de safeFetch et seraient sinon droppées.
    const res = await safeFetch(url, { timeoutMs: 15_000, maxBytes: 12 * 1024 * 1024 });
    if (!res.ok) {
      if (res.status === 404) return [];
      console.error(`[dvf] HTTP ${res.status} pour commune=${codeCommune} section=${sectionPrefixee}`);
      return [];
    }

    const data = await res.json();
    const mutations = data?.mutations;
    if (!Array.isArray(mutations)) return [];

    const result: DvfMutation[] = [];
    for (const raw of mutations) {
      const m = parseMutation(raw);
      if (m) result.push(m);
    }
    return result;
  } catch (err) {
    console.error('[dvf] fetchMutations error:', err);
    return [];
  }
}

const MAX_DVF_SECTIONS = 4;

/**
 * Déduplique et plafonne la liste de sections candidates.
 * L'ordre est préservé : la section principale (index 0) reste toujours en tête.
 * Exportée pour être testable sans I/O.
 */
export function capSections(sections: string[]): string[] {
  const unique = [...new Set(sections)];
  if (unique.length > MAX_DVF_SECTIONS) {
    console.log(`[dvf] sections truncated ${unique.length} -> ${MAX_DVF_SECTIONS}`);
    return unique.slice(0, MAX_DVF_SECTIONS);
  }
  return unique;
}

export async function fetchMutationsMultiSection(
  codeCommune: string,
  sections: string[],
): Promise<DvfMutation[]> {
  const capped = capSections(sections);

  const results = await Promise.all(
    capped.map((s) => fetchMutations(codeCommune, s)),
  );

  // Deduplicate by id_parcelle + date_mutation
  const seen = new Set<string>();
  const deduped: DvfMutation[] = [];

  for (const batch of results) {
    for (const m of batch) {
      const key = `${m.id_parcelle}|${m.date_mutation}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(m);
      }
    }
  }

  return deduped;
}
