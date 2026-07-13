/**
 * Étiquette énergie DPE (A→G) — échelle de couleurs OFFICIELLE réglementaire
 * (vert→rouge). Data-viz : palette figée par la norme, pas l'accent applicatif.
 * Vit hors des dossiers scannés par la gate Catalyst (couleurs réglementaires
 * légitimes, non soumises à l'accent unique).
 */
export const DPE_COLORS: Record<string, string> = {
  A: "#00a651",
  B: "#4cb848",
  C: "#bfd730",
  D: "#fff200",
  E: "#fdb913",
  F: "#f47b20",
  G: "#ed1c24",
};

/** Couleur de repli (zinc-600) pour une lettre inconnue. */
export const DPE_FALLBACK = "#475569";

/** Lettres à fond clair (jaune/orange) → texte sombre pour le contraste. */
export function dpeNeedsDarkText(letter: string): boolean {
  return letter === "D" || letter === "E" || letter === "F" || letter === "G";
}
