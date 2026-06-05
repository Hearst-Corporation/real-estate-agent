import { safeFetch } from './safe-fetch';
import { ENDPOINTS } from './endpoints';

export type Parcelle = {
  section: string;
  numero: string;
  codeInsee: string;
  codeDep: string;
};

export async function resolveParcelle(lat: number, lon: number): Promise<Parcelle | null> {
  const geom = JSON.stringify({ type: 'Point', coordinates: [lon, lat] });
  const url = `${ENDPOINTS.CADASTRE}?geom=${encodeURIComponent(geom)}`;

  try {
    const res = await safeFetch(url);
    if (!res.ok) {
      console.error(`[cadastre] HTTP ${res.status} pour lat=${lat}, lon=${lon}`);
      return null;
    }
    const data = await res.json();
    const features = data?.features;
    if (!Array.isArray(features) || features.length === 0) return null;

    const props = features[0]?.properties;
    if (!props) return null;

    const section: string = props.section ?? '';
    const numero: string = props.numero ?? '';
    const codeInsee: string = props.code_insee ?? '';
    const codeDep: string = props.code_dep ?? '';

    if (!section || !codeInsee) return null;

    return { section, numero, codeInsee, codeDep };
  } catch (err) {
    console.error('[cadastre] error:', err);
    return null;
  }
}
