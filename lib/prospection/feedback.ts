/**
 * lib/prospection/feedback.ts — normalisation du verdict de feedback sur un match.
 *
 * La table `prosp_match_feedback` a une CHECK `verdict IN ('up','down')`. L'UI émet
 * 👍/👎 (historiquement "like"/"dislike") et un bouton "Contacter"/"visite" qui ne
 * sont PAS du feedback noté. Cette fonction mappe ces signaux vers ce que la DB
 * accepte, sans jamais produire une valeur invalide.
 *
 * Retour :
 *   - "up" | "down" : à écrire en DB.
 *   - "noop"        : signal reconnu mais NON noté (contact/visite) → aucune
 *                     écriture DB (parcours pas encore défini).
 *   - null          : signal inconnu → 400 côté route.
 */
export type DbVerdict = "up" | "down";
export type VerdictOutcome = DbVerdict | "noop" | null;

export function normalizeVerdict(raw: unknown): VerdictOutcome {
  if (typeof raw !== "string") return null;
  switch (raw.trim().toLowerCase()) {
    case "up":
    case "like":
      return "up";
    case "down":
    case "dislike":
      return "down";
    case "contact":
    case "visite":
      return "noop"; // reconnu mais pas un verdict notable → pas d'écriture DB
    default:
      return null;
  }
}
