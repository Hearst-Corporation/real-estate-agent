/**
 * Carte statique maison-faite à partir des tuiles OpenStreetMap.
 *
 * Pure (aucun IO) : calcule la grille de tuiles + la position en pixels des
 * markers pour un rendu 100 % HTML/CSS (img absolus dans un cadre overflow:hidden).
 * Fonctionne identiquement en navigateur ET dans le rendu PDF chromium —
 * aucune clé API, aucune dépendance, aucune carte Google.
 *
 * Tuiles : https://tile.openstreetmap.org/{z}/{x}/{y}.png
 */

export type MapPoint = { lat: number; lon: number };

export type MapTile = { url: string; left: number; top: number };
export type MapMarker = { left: number; top: number };

export type StaticMap = {
  width: number;
  height: number;
  zoom: number;
  tiles: MapTile[];
  /** Marker du bien estimé (centre). */
  subject: MapMarker | null;
  /** Markers des annonces (mêmes index que la liste d'entrée, off-box filtrés). */
  listings: MapMarker[];
  attribution: string;
};

const TILE = 256;
const TILE_BASE = "https://tile.openstreetmap.org";

function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}
function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Pixel (left,top) d'un point dans le cadre, relatif au centre. */
function pointToPixel(
  p: MapPoint,
  center: MapPoint,
  z: number,
  w: number,
  h: number,
): { left: number; top: number } {
  const cx = lonToTileX(center.lon, z) * TILE;
  const cy = latToTileY(center.lat, z) * TILE;
  const px = lonToTileX(p.lon, z) * TILE;
  const py = latToTileY(p.lat, z) * TILE;
  return { left: px - cx + w / 2, top: py - cy + h / 2 };
}

/** Plus grand zoom (entre minZoom..maxZoom) où tous les points tiennent dans le cadre. */
function fitZoom(
  center: MapPoint,
  points: MapPoint[],
  w: number,
  h: number,
  padding: number,
  minZoom: number,
  maxZoom: number,
): number {
  for (let z = maxZoom; z >= minZoom; z--) {
    const ok = points.every((p) => {
      const { left, top } = pointToPixel(p, center, z, w, h);
      return (
        left >= padding &&
        left <= w - padding &&
        top >= padding &&
        top <= h - padding
      );
    });
    if (ok) return z;
  }
  return minZoom;
}

/**
 * Construit la carte de secteur : centre = bien estimé (ou centroïde des annonces),
 * markers = annonces géolocalisées. Le zoom s'ajuste pour cadrer l'ensemble.
 */
export function buildStaticMap(opts: {
  subject: MapPoint | null;
  listings: MapPoint[];
  width: number;
  height: number;
  minZoom?: number;
  maxZoom?: number;
}): StaticMap | null {
  const { width: w, height: h } = opts;
  const listings = opts.listings.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon),
  );

  // Centre : le bien si géolocalisé, sinon centroïde des annonces.
  let center = opts.subject;
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) {
    if (listings.length === 0) return null;
    center = {
      lat: listings.reduce((s, p) => s + p.lat, 0) / listings.length,
      lon: listings.reduce((s, p) => s + p.lon, 0) / listings.length,
    };
  }

  const allPoints = [center, ...listings];
  const z = fitZoom(
    center,
    allPoints,
    w,
    h,
    28,
    opts.minZoom ?? 11,
    opts.maxZoom ?? 15,
  );
  const n = 2 ** z;

  const cx = lonToTileX(center.lon, z);
  const cy = latToTileY(center.lat, z);

  // Plage de tuiles couvrant le cadre (+1 de marge).
  const minTx = Math.floor(cx - w / 2 / TILE) - 1;
  const maxTx = Math.floor(cx + w / 2 / TILE) + 1;
  const minTy = Math.floor(cy - h / 2 / TILE) - 1;
  const maxTy = Math.floor(cy + h / 2 / TILE) + 1;

  const tiles: MapTile[] = [];
  for (let tx = minTx; tx <= maxTx; tx++) {
    for (let ty = minTy; ty <= maxTy; ty++) {
      const wrapX = ((tx % n) + n) % n; // wrap horizontal
      if (ty < 0 || ty >= n) continue; // pas de wrap vertical
      tiles.push({
        url: `${TILE_BASE}/${z}/${wrapX}/${ty}.png`,
        left: (tx - cx) * TILE + w / 2,
        top: (ty - cy) * TILE + h / 2,
      });
    }
  }

  const onBox = (m: { left: number; top: number }) =>
    m.left >= -12 && m.left <= w + 12 && m.top >= -12 && m.top <= h + 12;

  const subjectMarker = pointToPixel(center, center, z, w, h);
  const listingMarkers = listings
    .map((p) => pointToPixel(p, center, z, w, h))
    .filter(onBox)
    .map((m) => ({ left: clamp(m.left, 0, w), top: clamp(m.top, 0, h) }));

  return {
    width: w,
    height: h,
    zoom: z,
    tiles,
    subject: opts.subject ? subjectMarker : null,
    listings: listingMarkers,
    attribution: "© OpenStreetMap",
  };
}
