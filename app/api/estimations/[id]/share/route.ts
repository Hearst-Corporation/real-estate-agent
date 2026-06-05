/**
 * POST /api/estimations/[id]/share
 *
 * Génère un lien de partage signé (30 jours) pour une estimation.
 * - 401 si non authentifié
 * - 503 si Supabase non configuré
 * - 404 si estimation non trouvée / n'appartient pas à l'utilisateur
 * - 409 si estimation pas encore "ready"
 * - 400 si body invalide
 *
 * Body (JSON, optionnel) : { email?: string }
 * Réponse                : { shareUrl: string, emailSent: boolean }
 *
 * Si email fourni + RESEND_API_KEY présent → envoie le lien par email (best-effort).
 */

import { z } from "zod";
import { Resend } from "resend";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import { signShareToken } from "@/lib/estimation/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

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

  // ── Status check ──────────────────────────────────────────────────────────
  if (row.status !== "ready") {
    return Response.json({ error: "not_ready" }, { status: 409 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let email: string | undefined;
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
    }
    email = parsed.data.email;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  // ── Signe le token ────────────────────────────────────────────────────────
  const token    = await signShareToken(id);
  const origin   = new URL(req.url).origin;
  const shareUrl = `${origin}/brochure/${token}`;

  // ── Email (best-effort) ───────────────────────────────────────────────────
  let emailSent = false;
  if (email && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const from   = process.env.RESEND_FROM_EMAIL ?? "noreply@hearstcorporation.io";

      const { error: resendError } = await resend.emails.send({
        from,
        to:      [email],
        subject: "Votre avis de valeur",
        html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><title>Votre avis de valeur</title></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:32px 16px">
  <h2 style="margin-top:0">Votre avis de valeur est disponible</h2>
  <p>Votre avis de valeur immobilière a été généré et est accessible via le lien ci-dessous.</p>
  <p>
    <a href="${shareUrl}"
       style="display:inline-block;background:#8B0000;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
      Consulter l'avis de valeur
    </a>
  </p>
  <p style="font-size:13px;color:#666">
    Ce lien est valable 30 jours. Après expiration, il ne sera plus accessible.
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
  <p style="font-size:12px;color:#999">
    Si vous n'attendiez pas cet email, vous pouvez l'ignorer.
  </p>
</body>
</html>`,
      });

      emailSent = !resendError;
      if (resendError) {
        console.warn("[share/route] Resend error (non-fatal):", resendError);
      }
    } catch (err) {
      console.warn("[share/route] Email send failed (non-fatal):", err);
    }
  }

  return Response.json({ shareUrl, emailSent });
}
