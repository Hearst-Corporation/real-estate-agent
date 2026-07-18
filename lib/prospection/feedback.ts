/**
 * lib/prospection/feedback.ts — normalisation du signal de feedback sur un match.
 *
 * ⚠️ SCHÉMA RÉEL gpu1 (migration 0017, vérifié via PostgREST) : la table
 * `prosp_match_feedback` a une colonne **`signal`** avec CHECK
 * `signal IN ('like','dislike','contact','visite')`. Il n'existe PAS de colonne
 * `verdict`, et 'up'/'down' ne sont PAS acceptés par la contrainte.
 *
 * L'UI émet 👍/👎 (up/down, ou legacy like/dislike) et des signaux d'action
 * (contact/visite). Cette fonction mappe TOUT vers une valeur que la DB accepte
 * réellement, sans jamais produire une valeur invalide (qui provoquait un 500).
 *
 * Sémantique produit (historique des propositions) :
 *   - like    = proposition retenue / poussée à l'acquéreur (👍)
 *   - dislike = proposition refusée / écartée (👎)
 *   - contact = un contact a été tenté sur cette annonce
 *   - visite  = une visite a été organisée
 *
 * Retour :
 *   - "like" | "dislike" | "contact" | "visite" : à écrire en DB (colonne signal).
 *   - null : signal inconnu → 400 côté route.
 */
export type DbSignal = "like" | "dislike" | "contact" | "visite";
export type SignalOutcome = DbSignal | null;

export function normalizeSignal(raw: unknown): SignalOutcome {
  if (typeof raw !== "string") return null;
  switch (raw.trim().toLowerCase()) {
    case "up":
    case "like":
      return "like";
    case "down":
    case "dislike":
      return "dislike";
    case "contact":
      return "contact";
    case "visite":
      return "visite";
    default:
      return null;
  }
}

/** Sens produit d'un signal : retenu / refusé / contacté / visité (pour l'UI historique). */
export type PropositionOutcome = "retenue" | "refusee" | "contactee" | "visitee";

export function signalOutcome(signal: DbSignal): PropositionOutcome {
  switch (signal) {
    case "like":
      return "retenue";
    case "dislike":
      return "refusee";
    case "contact":
      return "contactee";
    case "visite":
      return "visitee";
  }
}
