// ─── Swarms — constantes partagées ───────────────────────────────────────────

/** Durée en ms pendant laquelle un record DB mis à jour via webhook est
 *  considéré "frais" — permet d'éviter un poll moteur redondant côté getMissionState
 *  et la route GET /api/swarms/[id]/runs/[runId]. */
export const WEBHOOK_FRESH_MS = 15_000;

/** Statuts terminaux : un run dans cet état ne doit pas régresser. */
export const TERMINAL_STATUSES = ["done", "failed", "error"] as const;
