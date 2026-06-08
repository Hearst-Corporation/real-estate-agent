/**
 * GET /api/estimations/[id]/pdf
 *
 * Génère (ou sert depuis le cache R2) le PDF A4 de la brochure en inline.
 * - 401 si non authentifié
 * - 503 si Supabase non configuré
 * - 404 si estimation non trouvée / n'appartient pas à l'utilisateur
 * - 409 si estimation pas encore à l'état "ready" (pas de valuation)
 * - 500 si erreur de rendu PDF
 *
 * Cache R2 :
 *   - Si estimation.pdf_key présent ET pdf_generated_at >= updated_at → sert
 *     directement depuis R2 (évite un re-render Chromium coûteux).
 *   - Sinon : render → upload R2 → update DB → renvoie le PDF.
 *   - Si R2 non configuré → fallback render sans cache.
 */

import { createHash } from "node:crypto";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import { r2IsConfigured, getObject } from "@/lib/storage/r2";
import { rateLimit } from "@/lib/ratelimit";
import { captureFatal } from "@/lib/server/observe";
import { renderAndCacheEstimationPdf } from "@/lib/brochure/generate";

/** Calcule un ETag court (sha256, 16 hex chars) depuis un buffer PDF. Fail-soft → null. */
function computeEtag(buf: Buffer): string | null {
  try {
    return `"${createHash("sha256").update(buf).digest("hex").slice(0, 16)}"`;
  } catch {
    return null;
  }
}

/**
 * Normalise et compare un header If-None-Match à un ETag calculé.
 *
 * Gère :
 *  - `*` (wildcard) → toujours true
 *  - listes séparées par virgules : `"a", "b", W/"c"`
 *  - weak ETags : préfixe `W/` ignoré
 *  - guillemets retirés avant comparaison
 *
 * @param ifNoneMatch - Valeur brute du header If-None-Match (peut être null)
 * @param etag        - ETag calculé localement (ex. `"abc123"`)
 * @returns true si le 304 doit être émis (au moins un token correspond)
 */
function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  const bare = etag.replace(/^W\//, "").replace(/^"|"$/g, "");
  return ifNoneMatch
    .split(",")
    .map((t) => t.trim().replace(/^W\//, "").replace(/^"|"$/g, ""))
    .some((t) => t === bare);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const ifNoneMatch = req.headers.get("If-None-Match");

  // ── Auth ──────────────────────────────────────────────────────────────────
  const claims = await getSession();
  if (!claims) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── Supabase ──────────────────────────────────────────────────────────────
  const sb = getSupabaseAdmin();
  if (!sb) {
    return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  // ── Ownership check ───────────────────────────────────────────────────────
  const row = await loadOwnedEstimation(sb, id, userId, tenant);
  if (!row) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // ── Rate-limit (10 req / 60 s per user) ──────────────────────────────────
  const allowed = await rateLimit(`pdf:${userId}`, 10, 60);
  if (!allowed) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  // ── Status check ──────────────────────────────────────────────────────────
  if (row.status !== "ready" || !row.valuation) {
    return Response.json({ error: "not_ready" }, { status: 409 });
  }

  // ── R2 cache hit ──────────────────────────────────────────────────────────
  if (r2IsConfigured() && row.pdf_key && row.pdf_generated_at) {
    const generatedAt = new Date(row.pdf_generated_at).getTime();
    const updatedAt   = new Date(row.updated_at).getTime();

    if (generatedAt >= updatedAt) {
      try {
        const cached = await getObject(row.pdf_key);
        if (cached) {
          const etag = computeEtag(cached);
          // 304 Not Modified si le client a déjà ce contenu
          if (etag && etagMatches(ifNoneMatch, etag)) {
            return new Response(null, {
              status: 304,
              headers: {
                "Cache-Control": "private, max-age=300",
                "ETag": etag,
              },
            });
          }
          const headers: Record<string, string> = {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="avis-valeur-${id}.pdf"`,
            "Cache-Control": "private, max-age=300",
            "X-Cache": "HIT",
          };
          if (etag) headers["ETag"] = etag;
          return new Response(cached as unknown as BodyInit, { headers });
        }
        // Cache miss (object deleted from R2) → fall through to re-render
      } catch (err) {
        console.warn("[pdf/route] R2 getObject error, falling back to render:", err);
        // Fall through to re-render
      }
    }
  }

  // ── Render + cache (helper partagé avec le job Inngest A5b) ───────────────
  try {
    const pdfBuffer = await renderAndCacheEstimationPdf(sb, row);
    const etag = computeEtag(pdfBuffer);
    // 304 si le client a déjà ce rendu (cas rare sur MISS, mais correct)
    if (etag && etagMatches(ifNoneMatch, etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          "Cache-Control": "private, max-age=300",
          "ETag": etag,
        },
      });
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="avis-valeur-${id}.pdf"`,
      "Cache-Control": "private, max-age=300",
      "X-Cache": "MISS",
    };
    if (etag) headers["ETag"] = etag;
    return new Response(pdfBuffer as unknown as BodyInit, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "render_error";
    console.error("[pdf/route] render error:", err);
    captureFatal(err, "estimations/[id]/pdf");
    return Response.json({ error: message }, { status: 500 });
  }
}
