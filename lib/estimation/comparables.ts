import type { DvfComparable } from './types';
import type { DvfMutation } from './dvf';

// ─── Haversine distance (km) ─────────────────────────────────────────────────
function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Median of a sorted array ────────────────────────────────────────────────
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ─── P10–P90 trim ────────────────────────────────────────────────────────────
function trimP10P90(values: number[]): number[] {
  if (values.length < 5) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const lo = Math.floor(sorted.length * 0.1);
  const hi = Math.ceil(sorted.length * 0.9);
  return sorted.slice(lo, hi);
}

// ─── type_bien → type_local mapping ─────────────────────────────────────────
const TYPE_MAP: Record<string, string> = {
  maison: 'Maison',
  appartement: 'Appartement',
  immeuble: 'Appartement',
};

const NON_RESIDENTIAL = new Set(['Dépendance', 'Local industriel. commercial ou assimilé']);

// ─── Date filter ─────────────────────────────────────────────────────────────
function isWithinMonths(dateStr: string, months: number): boolean {
  try {
    const d = new Date(dateStr);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return d >= cutoff;
  } catch {
    return false;
  }
}

// ─── Subject type ────────────────────────────────────────────────────────────
type Subject = {
  type_bien: string | null;
  nombre_pieces: number | null;
  surface: number | null;
  lat: number;
  lon: number;
};

// ─── Result type ─────────────────────────────────────────────────────────────
type BuildComparablesResult = {
  comparables: DvfComparable[];
  medianPricePerSqm: number | null;
  nbComparables: number;
  confidence: 'indicative' | 'moyenne' | 'elevee';
  /** Distance moyenne (km) des comparables géolocalisés au bien. null si aucune géoloc. */
  distanceMoyenneKm: number | null;
};

export function buildComparables(
  subject: Subject,
  mutations: DvfMutation[],
): BuildComparablesResult {
  const expectedTypeLocal = subject.type_bien ? TYPE_MAP[subject.type_bien] ?? null : null;

  // Step 1 — exclude non-residential, filter by type
  let pool = mutations.filter((m) => {
    if (NON_RESIDENTIAL.has(m.type_local)) return false;
    if (expectedTypeLocal && m.type_local !== expectedTypeLocal) return false;
    return true;
  });

  // Step 2 — filter by pieces ±1 (if known)
  if (subject.nombre_pieces !== null) {
    const pc = subject.nombre_pieces;
    pool = pool.filter((m) => {
      if (m.nombre_pieces_principales === null) return true; // keep unknowns
      return Math.abs(m.nombre_pieces_principales - pc) <= 1;
    });
  }

  // Step 3 — filter by surface ±25% (if known)
  if (subject.surface !== null && subject.surface > 0) {
    const lo = subject.surface * 0.75;
    const hi = subject.surface * 1.25;
    pool = pool.filter((m) => m.surface_reelle_bati >= lo && m.surface_reelle_bati <= hi);
  }

  // Step 4 — date filter: 24 months, broaden to 36 if <5 results
  let filtered = pool.filter((m) => isWithinMonths(m.date_mutation, 24));
  if (filtered.length < 5) {
    filtered = pool.filter((m) => isWithinMonths(m.date_mutation, 36));
  }

  // Step 5 — compute prix_m2 per comparable
  const withPrixM2 = filtered.map((m) => ({
    ...m,
    prix_m2: m.valeur_fonciere / m.surface_reelle_bati,
  }));

  // Step 6 — P10–P90 trim on prix_m2
  if (withPrixM2.length >= 5) {
    const prixM2Values = withPrixM2.map((m) => m.prix_m2).sort((a, b) => a - b);
    const lo = Math.floor(prixM2Values.length * 0.1);
    const hi = Math.ceil(prixM2Values.length * 0.9);
    const loVal = prixM2Values[lo];
    const hiVal = prixM2Values[hi - 1] ?? prixM2Values[prixM2Values.length - 1];
    const trimmed = withPrixM2.filter((m) => m.prix_m2 >= loVal && m.prix_m2 <= hiVal);
    if (trimmed.length > 0) {
      filtered = trimmed;
    }
  }

  // Step 7 — compute final prix_m2 after trim
  const finalWithPrixM2 = filtered.map((m) => ({
    ...m,
    prix_m2: m.valeur_fonciere / m.surface_reelle_bati,
    distance_km:
      m.latitude !== null && m.longitude !== null
        ? haversineKm(subject.lat, subject.lon, m.latitude, m.longitude)
        : null,
  }));

  // Step 8 — sort by recency then distance
  finalWithPrixM2.sort((a, b) => {
    const dateDiff = new Date(b.date_mutation).getTime() - new Date(a.date_mutation).getTime();
    if (dateDiff !== 0) return dateDiff;
    const da = a.distance_km ?? 999;
    const db = b.distance_km ?? 999;
    return da - db;
  });

  // Step 9 — median prix_m2 on trimmed set
  const allPrixM2 = trimP10P90(finalWithPrixM2.map((m) => m.prix_m2));
  const medianPricePerSqm = median(allPrixM2);

  // Step 10 — cap at 10 comparables for output
  const top10 = finalWithPrixM2.slice(0, 10);

  const comparables: DvfComparable[] = top10.map((m) => ({
    id: m.id_parcelle || crypto.randomUUID(),
    date_mutation: m.date_mutation,
    adresse: m.id_parcelle ? `Parcelle ${m.id_parcelle}` : 'Secteur',
    code_postal: '',
    ville: '',
    surface_reelle_bati: m.surface_reelle_bati,
    valeur_fonciere: m.valeur_fonciere,
    prix_m2: Math.round(m.prix_m2),
    type_local: m.type_local,
    nombre_pieces: m.nombre_pieces_principales,
  }));

  const nbComparables = finalWithPrixM2.length;
  const confidence: 'indicative' | 'moyenne' | 'elevee' =
    nbComparables >= 5 ? 'elevee' : nbComparables >= 3 ? 'moyenne' : 'indicative';

  // Distance moyenne des comps géolocalisés (explicabilité de la confiance).
  const distances = finalWithPrixM2
    .map((m) => m.distance_km)
    .filter((d): d is number => d !== null);
  const distanceMoyenneKm =
    distances.length > 0
      ? Math.round((distances.reduce((a, b) => a + b, 0) / distances.length) * 100) / 100
      : null;

  return { comparables, medianPricePerSqm, nbComparables, confidence, distanceMoyenneKm };
}
