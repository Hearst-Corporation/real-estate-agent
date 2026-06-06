/**
 * Helpers de formatage FR pour les primitives invest (présentation pure).
 * EUR par défaut — JAMAIS USDT (L7). Aucun calcul financier ici.
 */

/** Montant en euros au format FR (ex. "5 000 €"). Arrondi à l'euro. */
export function eur(montant: number, opts?: { decimals?: number }): string {
  const decimals = opts?.decimals ?? 0;
  return `${montant.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} €`;
}

/** Pourcentage au format FR (ex. 0.092 → "9,2 %"). `null` → "—". */
export function pct(part: number | null, decimals = 1): string {
  if (part == null || Number.isNaN(part)) return "—";
  return `${(part * 100).toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} %`;
}

/** Compacte un nombre (740000 → "740k"). Pour les labels de carte. */
export function compact(montant: number): string {
  if (Math.abs(montant) >= 1_000_000) return `${(montant / 1_000_000).toFixed(montant % 1_000_000 === 0 ? 0 : 1)}M`;
  if (Math.abs(montant) >= 1_000) return `${Math.round(montant / 1_000)}k`;
  return `${montant}`;
}
