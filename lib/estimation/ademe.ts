/**
 * Best-effort DPE via ADEME open data.
 *
 * Endpoint : https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines
 * Paramètres : q=<adresse>&size=1 (recherche full-text).
 *
 * Remarques :
 * - L'API ADEME peut changer de dataset slug (dpe03existant, dpe-france, etc.)
 *   sans préavis. Le code est défensif : toute erreur → {classe:null}.
 * - L'indice de performance énergétique renvoyé par l'API peut être dans
 *   différents champs selon la version (lettre_dpe, classe_consommation_energie,
 *   etiquette_dpe). On probe par ordre de préférence.
 * - Ne bloque jamais la valorisation — résultat optionnel.
 */

import { safeFetch } from './safe-fetch';
import { ENDPOINTS } from './endpoints';

const VALID_CLASSES = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

function parseClasse(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();
  return VALID_CLASSES.has(upper) ? upper : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractClasse(item: any): string | null {
  // Probe multiple possible field names (API évolue)
  const candidates = [
    item?.etiquette_dpe,
    item?.lettre_dpe,
    item?.classe_consommation_energie,
    item?.classe_dpe,
    item?.DPE,
    item?.dpe,
  ];
  for (const c of candidates) {
    const parsed = parseClasse(c);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Tente de récupérer la classe DPE pour une adresse via l'open data ADEME.
 * Retourne `{classe: null}` en cas d'échec ou d'indisponibilité.
 * Ne lève jamais d'exception.
 */
export async function fetchDpeForAddress(
  adresse: string,
): Promise<{ classe: string | null }> {
  const FALLBACK = { classe: null } as const;

  if (!adresse || adresse.trim().length === 0) return FALLBACK;

  try {
    const url = `${ENDPOINTS.ADEME}/dpe03existant/lines?q=${encodeURIComponent(adresse.trim())}&size=1`;
    const res = await safeFetch(url, { timeoutMs: 6_000 });

    if (!res.ok) {
      console.warn(`[ademe] HTTP ${res.status} pour adresse="${adresse}"`);
      return FALLBACK;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
      data = await res.json();
    } catch {
      return FALLBACK;
    }

    // Formats possibles : { results: [...] } ou { hits: [...] } ou { items: [...] }
    const results: unknown[] =
      data?.results ?? data?.hits ?? data?.items ?? data?.lines ?? [];

    if (!Array.isArray(results) || results.length === 0) return FALLBACK;

    const classe = extractClasse(results[0]);
    return { classe };
  } catch (err) {
    // safeFetch peut throw si hôte non autorisé ou timeout — on absorbe
    console.warn('[ademe] fetchDpeForAddress error:', err);
    return FALLBACK;
  }
}
