/**
 * lib/jobs/inngest/functions.ts — Fonctions Inngest enregistrées.
 *
 * A5a : uniquement `ping` (no-op) pour valider la plomberie. Aucun flow produit.
 */

import { inngest } from "./client";

/** No-op : prouve que la plomberie serve()/event fonctionne. */
export const ping = inngest.createFunction(
  { id: "ping", triggers: [{ event: "app/ping" }] },
  async ({ event }) => {
    return { ok: true, at: event.ts ?? null };
  },
);

export const functions = [ping];
