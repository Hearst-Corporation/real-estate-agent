import { safeFetch } from './safe-fetch';
import { ENDPOINTS } from './endpoints';

export type GeocodeResult = {
  lat: number;
  lon: number;
  inseeCode: string;
  city: string;
  postcode: string;
  score: number;
};

// Bounds for métropole France
const LAT_MIN = 41;
const LAT_MAX = 52;
const LON_MIN = -5;
const LON_MAX = 10;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFeature(feature: any): GeocodeResult | null {
  try {
    const props = feature?.properties;
    const coords = feature?.geometry?.coordinates; // [lon, lat]
    if (!props || !Array.isArray(coords) || coords.length < 2) return null;

    const lon = coords[0] as number;
    const lat = coords[1] as number;
    const score = props.score as number;
    const inseeCode: string = props.citycode ?? props.city_code ?? '';
    const city: string = props.city ?? props.label ?? '';
    const postcode: string = props.postcode ?? props.zipcode ?? '';

    if (typeof lat !== 'number' || typeof lon !== 'number') return null;
    if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) {
      console.error(`[geocode] coordonnées hors métropole : lat=${lat}, lon=${lon}`);
      return null;
    }
    if (typeof score !== 'number' || score < 0.4) return null;

    return { lat, lon, inseeCode, city, postcode, score };
  } catch {
    return null;
  }
}

async function fetchBAN(adresse: string): Promise<GeocodeResult | null> {
  const url = `${ENDPOINTS.BAN}?q=${encodeURIComponent(adresse)}&limit=1`;
  try {
    const res = await safeFetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const features = data?.features;
    if (!Array.isArray(features) || features.length === 0) return null;
    return parseFeature(features[0]);
  } catch (err) {
    console.error('[geocode] BAN error:', err);
    return null;
  }
}

async function fetchGeopf(adresse: string): Promise<GeocodeResult | null> {
  const url = `${ENDPOINTS.GEOCODEUR_FAILOVER}?q=${encodeURIComponent(adresse)}&limit=1&type=housenumber`;
  try {
    const res = await safeFetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const features = data?.features;
    if (!Array.isArray(features) || features.length === 0) return null;
    return parseFeature(features[0]);
  } catch (err) {
    console.error('[geocode] Geopf error:', err);
    return null;
  }
}

export async function geocode(adresse: string): Promise<GeocodeResult | null> {
  const primary = await fetchBAN(adresse);
  if (primary) return primary;

  console.warn('[geocode] BAN échoué, failover vers Geopf');
  return fetchGeopf(adresse);
}
