/**
 * lib/crm/financement.ts — Situation de financement d'un lead acquéreur.
 *
 * La colonne `leads.financement` (jsonb, migration 0043) était inerte : présente
 * en base et typée `Json | null`, mais jamais lue ni écrite. Ce module lui donne
 * une forme structurée, validée (Zod) et affichable, pour qualifier/prioriser un
 * acquéreur selon sa capacité de financement (comptant, prêt en cours, accord de
 * principe, prêt à obtenir, en réflexion).
 *
 * Contraintes :
 *   - Pur (zéro dépendance React/Cockpit) ; réutilisable API + UI + tests.
 *   - Aucune donnée fabriquée : `financement` vide/inconnu ⇒ null, jamais un défaut
 *     trompeur. L'UI affiche « non renseigné » à partir de null.
 *   - Les libellés vivent ICI (fichier owned) et non dans `lib/ui-strings.ts`
 *     (partagé) — ils sont référencés en JSX via des expressions `{...}`.
 */

import { z } from "zod";

// ─── Enum des modes de financement (valeurs stockées, stables) ────────────────

export const FINANCEMENT_MODES = [
  "comptant",
  "pret_en_cours",
  "accord_principe",
  "pret_a_obtenir",
  "en_reflexion",
] as const;

export type FinancementMode = (typeof FINANCEMENT_MODES)[number];

/** Montant maximal accepté (garde-fou anti-saisie absurde), en euros. */
export const FINANCEMENT_MONTANT_MAX = 1_000_000_000;
/** Longueur max des champs texte libres. */
export const FINANCEMENT_TEXT_MAX = 200;

// ─── Libellés FR (référencés en JSX via expressions, hors lint-strings) ───────

/** Libellé lisible d'un mode. Fallback = la valeur brute si mode inconnu. */
export const FINANCEMENT_MODE_LABELS: Record<string, string> = {
  comptant: "Comptant",
  pret_en_cours: "Prêt en cours",
  accord_principe: "Accord de principe",
  pret_a_obtenir: "Prêt à obtenir",
  en_reflexion: "En réflexion",
};

/** Chaînes d'UI de la section financement (owned, hors ui-strings partagé). */
export const FINANCEMENT_UI = {
  cardTitle: "Financement",
  eyebrow: "Capacité d'achat",
  // Champs formulaire
  mode: "Situation de financement",
  modePlaceholder: "— Non renseigné —",
  apport: "Apport (€)",
  montantPret: "Montant du prêt (€)",
  organisme: "Banque / courtier",
  organismePlaceholder: "Ex. : Crédit Agricole, courtier…",
  notes: "Précisions",
  notesPlaceholder: "Contexte, échéance, conditions…",
  // Détail
  fieldApport: "Apport",
  fieldMontantPret: "Montant du prêt",
  fieldOrganisme: "Banque / courtier",
  fieldNotes: "Précisions",
  // États
  empty: "Financement non renseigné.",
  notProvided: "Non renseigné",
} as const;

// ─── Badge sémantique (tonalité de qualification) ─────────────────────────────

/**
 * Tonalité indicative de solidité du financement pour la priorisation.
 * Neutre par défaut : jamais une couleur « validée » sur une info non fournie.
 * Couleurs = palette Badge Catalyst autorisée (zinc/lime/amber).
 */
export type FinancementTone = "zinc" | "lime" | "amber";

export function financementTone(mode: FinancementMode): FinancementTone {
  switch (mode) {
    case "comptant":
    case "accord_principe":
      return "lime"; // financement solide / quasi acquis
    case "pret_en_cours":
    case "pret_a_obtenir":
      return "amber"; // en cours, à confirmer
    case "en_reflexion":
      return "zinc"; // non engagé
  }
}

// ─── Forme structurée & schéma Zod ────────────────────────────────────────────

export type Financement = {
  mode: FinancementMode;
  apport: number | null;
  montant_pret: number | null;
  organisme: string | null;
  notes: string | null;
};

const montantSchema = z
  .number()
  .int()
  .min(0)
  .max(FINANCEMENT_MONTANT_MAX)
  .nullable();

const texteSchema = z
  .string()
  .trim()
  .max(FINANCEMENT_TEXT_MAX)
  .nullable();

/**
 * Schéma d'ENTRÉE (payload API). Accepte des champs partiels ; normalise les
 * chaînes vides en null. `mode` est obligatoire dès qu'un objet financement est
 * fourni (sans mode, il n'y a rien de qualifiable → on renvoie null en amont).
 */
export const FinancementInputSchema = z
  .object({
    mode: z.enum(FINANCEMENT_MODES),
    apport: montantSchema.optional(),
    montant_pret: montantSchema.optional(),
    organisme: texteSchema.optional(),
    notes: texteSchema.optional(),
  })
  .strict();

export type FinancementInput = z.infer<typeof FinancementInputSchema>;

/**
 * Schéma du champ `financement` complet d'une requête (POST/PATCH) :
 *   - `null` → efface explicitement le financement.
 *   - objet → validé par FinancementInputSchema.
 *   - absent (`undefined`) → non touché (géré par l'appelant, pas ici).
 */
export const FinancementFieldSchema = FinancementInputSchema.nullable();

// ─── Normalisation (entrée → forme stockée) ───────────────────────────────────

/**
 * Convertit un input validé en objet `Financement` prêt à stocker.
 * Chaînes vides → null. Renvoie null si `input` est null/undefined.
 */
export function normalizeFinancement(
  input: FinancementInput | null | undefined,
): Financement | null {
  if (input == null) return null;
  const org = input.organisme?.trim();
  const notes = input.notes?.trim();
  return {
    mode: input.mode,
    apport: input.apport ?? null,
    montant_pret: input.montant_pret ?? null,
    organisme: org ? org : null,
    notes: notes ? notes : null,
  };
}

// ─── Parsing (jsonb DB → forme sûre pour l'affichage) ─────────────────────────

/**
 * Lit une valeur `financement` issue de la DB (jsonb non fiable) et renvoie un
 * `Financement` sûr, ou null si absent / illisible / mode inconnu.
 * Ne jette jamais — toute donnée corrompue est traitée comme « non renseigné ».
 */
export function parseFinancement(value: unknown): Financement | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const mode = raw.mode;
  if (typeof mode !== "string" || !(FINANCEMENT_MODES as readonly string[]).includes(mode)) {
    return null;
  }
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  return {
    mode: mode as FinancementMode,
    apport: num(raw.apport),
    montant_pret: num(raw.montant_pret),
    organisme: str(raw.organisme),
    notes: str(raw.notes),
  };
}

// ─── Helpers d'affichage / qualification ──────────────────────────────────────

/** Vrai si un financement exploitable est renseigné. */
export function hasFinancement(value: unknown): boolean {
  return parseFinancement(value) !== null;
}

/** Libellé lisible d'un mode (fallback = valeur brute). */
export function financementModeLabel(mode: string): string {
  return FINANCEMENT_MODE_LABELS[mode] ?? mode;
}

/**
 * Résumé compact d'un financement pour une ligne de tableau / badge.
 * Ex. : « Accord de principe » ou « Comptant · apport 150 000 € ».
 * Renvoie null si non renseigné (l'appelant affiche « non renseigné »).
 */
export function financementSummary(value: unknown): string | null {
  const f = parseFinancement(value);
  if (!f) return null;
  const parts = [financementModeLabel(f.mode)];
  if (f.mode === "comptant" && f.apport != null) {
    parts.push(`${eurCompact(f.apport)}`);
  } else if (f.montant_pret != null) {
    parts.push(`prêt ${eurCompact(f.montant_pret)}`);
  } else if (f.apport != null) {
    parts.push(`apport ${eurCompact(f.apport)}`);
  }
  return parts.join(" · ");
}

/** Format euro compact, sans dépendre du helper CRM (évite un cycle). */
function eurCompact(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
