/**
 * GET /api/brochure/[token]/pdf
 *
 * Route publique — le token signé (REPORT_SHARING_SECRET) EST l'autorisation.
 * Aucune session requise.
 *
 * - 401 si token invalide / expiré
 * - 503 si Supabase non configuré
 * - 404 si estimation absente ou pas "ready"
 * - Sert le PDF depuis R2 si disponible, sinon re-rend.
 */

import { verifyShareToken } from "@/lib/estimation/share";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { r2IsConfigured, getObject } from "@/lib/storage/r2";
import type {
  Estimation,
  PropertyData,
  FieldStatusMap,
  MarketAnalysis,
  Valuation,
} from "@/lib/estimation/types";
import { parseProvenance } from "@/lib/estimation/provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;

  // ── Vérifier le token signé ───────────────────────────────────────────────
  const verified = await verifyShareToken(token);
  if (!verified) {
    return Response.json({ error: "invalid_or_expired_token" }, { status: 401 });
  }
  const { estimationId } = verified;

  // ── Supabase (service-role — pas de filtre user) ──────────────────────────
  const sb = getSupabaseAdmin();
  if (!sb) {
    return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const { data: row, error } = await sb
    .from("estimations")
    .select("*")
    .eq("id", estimationId)
    .maybeSingle();

  if (error) throw error;
  if (!row || row.status !== "ready" || !row.valuation) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // ── R2 cache hit ──────────────────────────────────────────────────────────
  if (r2IsConfigured() && row.pdf_key && row.pdf_generated_at) {
    const generatedAt = new Date(row.pdf_generated_at).getTime();
    const updatedAt   = new Date(row.updated_at).getTime();

    if (generatedAt >= updatedAt) {
      try {
        const cached = await getObject(row.pdf_key);
        if (cached) {
          return new Response(cached as unknown as BodyInit, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="avis-valeur-${estimationId}.pdf"`,
              "Cache-Control": "public, max-age=3600",
              "X-Cache": "HIT",
            },
          });
        }
      } catch (err) {
        console.warn("[brochure/pdf] R2 getObject error, falling back to render:", err);
      }
    }
  }

  // Provenance honnête, extraite du snapshot persisté (défensif, [] si absent).
  const snapProvenance = (() => {
    const snap = row.sources_snapshot;
    if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
    return parseProvenance((snap as Record<string, unknown>).provenance);
  })();

  // ── Re-render ─────────────────────────────────────────────────────────────
  const estimation: Estimation = {
    id: row.id,
    userId: row.user_id ?? "",
    tenantId: row.tenant_id,
    status: row.status as Estimation["status"],
    property: (row.property ?? {}) as PropertyData,
    fieldStatus: (row.field_status ?? {}) as FieldStatusMap,
    market: (row.market ?? null) as MarketAnalysis | null,
    valuation: row.valuation as Valuation,
    saleStrategies: Array.isArray(row.sale_strategies)
      ? (row.sale_strategies as string[])
      : null,
    branding: (row.branding ?? null) as Record<string, unknown> | null,
    provenance: snapProvenance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  try {
    const { renderBrochureHtml } = await import("@/lib/brochure/render-html");
    const { renderEstimationPdf } = await import("@/lib/brochure/pdf");
    const html      = renderBrochureHtml(estimation);
    const pdfBuffer = await renderEstimationPdf(html);

    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="avis-valeur-${estimationId}.pdf"`,
        "Cache-Control": "public, max-age=3600",
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    console.error("[brochure/pdf] render error:", err);
    return Response.json({ error: "render_error" }, { status: 500 });
  }
}
