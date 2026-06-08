/**
 * lib/crm/demo-filter.ts — masque les données de SEED/TEST dans les vues, sans
 * jamais toucher la base. Réversible via env (HIDE_SEED_DATA=false pour tout voir).
 *
 * Beaucoup de lignes de démo polluent l'UI agent (TEST-*, [SEED], TestCity…).
 * On les FILTRE côté serveur au rendu — aucune suppression DB, aucune migration.
 */

/** Motifs reconnus comme données de test/seed (insensible à la casse). */
const SEED_PATTERNS = [/\bTEST-/i, /\[SEED\]/i, /\bTestCity\b/i, /^Nouveau lead$/i];

/** true si la chaîne ressemble à un libellé de seed/test. */
export function isSeedLabel(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  return SEED_PATTERNS.some((re) => re.test(v));
}

/** Le masquage est-il actif ? (par défaut OUI ; HIDE_SEED_DATA=false le désactive). */
export function hideSeedEnabled(): boolean {
  return process.env.HIDE_SEED_DATA !== "false";
}

/**
 * Filtre une liste en retirant les entrées dont l'un des champs-libellés est un
 * seed. No-op si le masquage est désactivé. `getLabels` extrait les chaînes à
 * tester (ex. titre + ville pour un bien, nom pour un lead).
 */
export function filterSeed<T>(rows: T[], getLabels: (row: T) => Array<string | null | undefined>): T[] {
  if (!hideSeedEnabled()) return rows;
  return rows.filter((row) => !getLabels(row).some(isSeedLabel));
}
