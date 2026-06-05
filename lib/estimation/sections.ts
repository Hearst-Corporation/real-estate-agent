import { safeFetch } from './safe-fetch';
import { ENDPOINTS } from './endpoints';

export function toSectionPrefixee(section: string): string {
  // Left-pad with zeros to 5 chars ("AM" -> "000AM", "A" -> "0000A")
  return section.padStart(5, '0');
}

/**
 * Sections cadastrales candidates autour d'un point géocodé.
 *
 * On interroge apicarto par une PETITE BBOX autour du point (et non par
 * `code_insee`, qui timeout pour les grosses communes type Lyon/Paris, ni par
 * Point exact, qui échoue quand l'adresse tombe sur une voie). La bbox renvoie
 * les parcelles voisines → leurs sections (ex: AM, AN, BL).
 *
 * ⚠ On n'utilise PAS le code_insee renvoyé par le cadastre : pour Lyon/Paris/
 * Marseille il vaut le code commune (69123) alors que DVF indexe sous le code
 * arrondissement (69386). L'appelant fournit donc l'INSEE DVF (issu du géocodage
 * BAN) séparément ; ici on ne renvoie que les codes section préfixés.
 *
 * Renvoie [] si rien trouvé (mode dégradé propre, jamais de section bidon).
 */
export async function candidateSections(
  lat: number,
  lon: number,
  subjectSection?: string,
): Promise<string[]> {
  const out = new Set<string>();
  if (subjectSection) out.add(toSectionPrefixee(subjectSection));

  // Rayons croissants (~40m puis ~180m) jusqu'à avoir assez de sections.
  for (const d of [0.0008, 0.0018]) {
    if (out.size >= 6) break;
    try {
      const poly = {
        type: 'Polygon',
        coordinates: [[
          [lon - d, lat - d],
          [lon + d, lat - d],
          [lon + d, lat + d],
          [lon - d, lat + d],
          [lon - d, lat - d],
        ]],
      };
      const url = `${ENDPOINTS.CADASTRE}?geom=${encodeURIComponent(JSON.stringify(poly))}`;
      const res = await safeFetch(url, { timeoutMs: 12_000, maxBytes: 6 * 1024 * 1024 });
      if (!res.ok) continue;
      const data = await res.json();
      const features = data?.features;
      if (!Array.isArray(features)) continue;
      for (const feature of features) {
        const section: string | undefined = feature?.properties?.section;
        if (section && typeof section === 'string') out.add(toSectionPrefixee(section));
        if (out.size >= 8) break;
      }
    } catch (err) {
      console.warn('[sections] bbox apicarto échouée:', err);
    }
  }

  return Array.from(out);
}
