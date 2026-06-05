/**
 * lib/brochure/generate.ts — Rendu + mise en cache R2 du PDF d'estimation.
 *
 * Source unique partagée par le GET synchrone (cache-miss) et le job Inngest
 * (pré-chauffage A5b), pour garantir une clé/validité de cache identiques.
 * Clé R2 timestampée ; validité = pdf_generated_at >= updated_at (inchangé).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { r2IsConfigured, putObject, publicUrl } from "@/lib/storage/r2";
import type {
  Estimation,
  PropertyData,
  FieldStatusMap,
  MarketAnalysis,
  Valuation,
} from "@/lib/estimation/types";

type EstimationRow = Database["public"]["Tables"]["estimations"]["Row"];

function rowToEstimation(row: EstimationRow): Estimation {
  return {
    id: row.id,
    userId: row.user_id ?? "",
    tenantId: row.tenant_id,
    status: row.status as Estimation["status"],
    property: (row.property ?? {}) as PropertyData,
    fieldStatus: (row.field_status ?? {}) as FieldStatusMap,
    market: (row.market ?? null) as MarketAnalysis | null,
    valuation: row.valuation as Valuation,
    saleStrategies: Array.isArray(row.sale_strategies) ? (row.sale_strategies as string[]) : null,
    branding: (row.branding ?? null) as Record<string, unknown> | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Rend le PDF, l'upload sur R2 (best-effort) et met à jour pdf_key/url/generated_at.
 * Ne touche PAS pdf_status (géré par le caller : GET ignore, job pose 'ready').
 * Retourne le buffer PDF.
 */
export async function renderAndCacheEstimationPdf(
  sb: SupabaseClient<Database>,
  row: EstimationRow,
): Promise<Buffer> {
  const estimation = rowToEstimation(row);

  const { renderBrochureHtml } = await import("@/lib/brochure/render-html");
  const { renderEstimationPdf } = await import("@/lib/brochure/pdf");
  const html = renderBrochureHtml(estimation);
  const pdfBuffer = (await renderEstimationPdf(html)) as Buffer;

  if (r2IsConfigured()) {
    const key = `estimations/${row.id}/avis-${Date.now()}.pdf`;
    const pdfUrl = publicUrl(key);
    const nowIso = new Date().toISOString();
    try {
      await putObject(key, pdfBuffer, "application/pdf");
      await sb
        .from("estimations")
        .update({ pdf_key: key, pdf_url: pdfUrl, pdf_generated_at: nowIso })
        .eq("id", row.id);
    } catch (err) {
      console.warn("[brochure/generate] R2 upload/DB update failed (non-fatal):", err);
    }
  }

  return pdfBuffer;
}
