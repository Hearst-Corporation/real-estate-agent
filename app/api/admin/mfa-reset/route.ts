/**
 * POST /api/admin/mfa-reset — réinitialise le MFA d'un autre utilisateur (admin only).
 *
 * Comble le trou de recovery : un user qui a perdu son authenticator ET ses backup
 * codes ne peut plus se connecter. Un admin réinitialise son MFA (2FA → off, secret
 * purgé, backup codes purgés) → le user se reconnecte au mot de passe puis ré-enrôle.
 *
 * Gating STRICT calqué sur app/api/admin/route.ts :
 *   - 401 non authentifié · 403 si role !== 'admin' (un non-admin ne peut JAMAIS
 *     réinitialiser le MFA d'autrui) · 400 body invalide · 503 si l'opération DB échoue.
 *
 * ISOLATION MULTI-TENANT (fail-closed) : le client service-role bypass la RLS, donc le
 * seul check de rôle ne borne PAS le tenant. On vérifie que le user cible appartient AU
 * MÊME tenant que l'admin (isSameTenant, source `auth_credentials`) AVANT toute écriture.
 * User d'un autre tenant, introuvable, ou DB indisponible → 403 (jamais d'action). Un admin
 * du tenant A ne peut donc jamais reset le MFA d'un compte du tenant B.
 *
 * Body: { userId: string }  (uuid)
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { disableMfa } from "@/lib/server/mfa-store";
import { isSameTenant } from "@/lib/server/auth-admin";
import { captureServer } from "@/lib/providers/posthog";
import { recordAuthEvent } from "@/lib/server/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Gating ADMIN STRICT — identique à app/api/admin/route.ts (claims.role !== "admin").
  if (claims.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Validation du body : userId string non vide, format uuid.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const userId = (body as { userId?: unknown })?.userId;
  if (typeof userId !== "string" || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Isolation multi-tenant FAIL-CLOSED — AVANT toute écriture DB. Le tenant vient du JWT
  // vérifié (claims.tenant_id), jamais du body. Cible hors tenant / introuvable / DB KO → 403.
  const sameTenant = await isSameTenant(claims.tenant_id, userId);
  if (!sameTenant) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Réutilise le store MFA (pas de requête DB inline dupliquée). Fail-soft : false sur erreur DB.
  const ok = await disableMfa(userId);
  if (!ok) return NextResponse.json({ error: "mfa_reset_failed" }, { status: 503 });

  // Audit best-effort (fail-soft, ne casse jamais la réponse) — acteur = admin, cible = userId.
  captureServer(claims.sub, "admin.mfa_reset", { target_user_id: userId });
  await recordAuthEvent({ event: "mfa_reset", req, userId, meta: { actor: claims.sub } });

  return NextResponse.json({ ok: true, userId });
}
