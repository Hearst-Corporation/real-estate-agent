/**
 * lib/jobs/inngest/functions.ts — Fonctions Inngest enregistrées.
 *
 * A5a : uniquement `ping` (no-op) pour valider la plomberie. Aucun flow produit.
 */

import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { renderAndCacheEstimationPdf } from "@/lib/brochure/generate";
import { captureFatal } from "@/lib/server/observe";

/** No-op : prouve que la plomberie serve()/event fonctionne. */
export const ping = inngest.createFunction(
  { id: "ping", triggers: [{ event: "app/ping" }] },
  async ({ event }) => {
    return { ok: true, at: event.ts ?? null };
  },
);

/**
 * Pré-chauffage PDF (A5b) : rend + cache R2, pose pdf_status. Le GET synchrone
 * reste le fallback. Idempotence assurée par l'event id côté émetteur.
 */
export const generatePdf = inngest.createFunction(
  { id: "generate-pdf", triggers: [{ event: "estimation/pdf.prewarm" }] },
  async ({ event }) => {
    const estimationId = (event.data as { estimationId?: string })?.estimationId;
    if (!estimationId) return { skipped: "no_id" };

    const sb = getSupabaseAdmin();
    if (!sb) return { skipped: "no_db" };

    const { data: row } = await sb
      .from("estimations")
      .select("*")
      .eq("id", estimationId)
      .maybeSingle();
    if (!row) return { skipped: "not_found" };

    try {
      await renderAndCacheEstimationPdf(sb, row);
      await sb.from("estimations").update({ pdf_status: "ready" }).eq("id", estimationId);
      return { ok: true };
    } catch (err) {
      await sb.from("estimations").update({ pdf_status: "failed" }).eq("id", estimationId);
      captureFatal(err, "inngest/generate-pdf");
      throw err; // laisse Inngest enregistrer l'échec / retry
    }
  },
);

export const functions = [ping, generatePdf];
