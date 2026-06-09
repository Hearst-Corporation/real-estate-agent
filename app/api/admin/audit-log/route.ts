/**
 * GET /api/admin/audit-log — lecture du journal d'audit (admin only).
 *
 * Gating STRICT identique à app/api/admin/mfa-reset/route.ts :
 *   - 401 non authentifié (pas de claims)
 *   - 403 si claims.role !== "admin"
 *
 * Query params :
 *   limit    — défaut 50, borné à MAX_LIMIT (200) via Math.min ; toujours >= 1.
 *   offset   — défaut 0, toujours >= 0.
 *   event    — filtre optionnel sur le type d'événement (string brut, ex: "login_failed").
 *   user_id  — filtre optionnel sur l'UUID utilisateur ; rejeté avec 400 si format invalide.
 *
 * Réponse succès  : { rows: AuditRow[], limit: number, offset: number }
 * Fail-soft DB    : { rows: [], limit: number, offset: number } — jamais 500 sur lecture forensique.
 *
 * La table `auth_audit_log` n'est pas dans les types générés (même situation que `user_mfa`
 * dans lib/server/mfa-store.ts) → cast SupabaseClient non typé.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pagination : limite max acceptée en query param. */
const MAX_LIMIT = 200;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Client service-role non typé (table hors types générés). `null` si Supabase non configuré. */
function untypedAdmin(): SupabaseClient | null {
  return getSupabaseAdmin() as SupabaseClient | null;
}

export async function GET(req: Request) {
  // — Auth : 401 si pas de session ——————————————————————————————————————
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // — Gating admin STRICT : 403 si role !== "admin" ————————————————————
  if (claims.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // — Parsing & validation des query params ————————————————————————————
  const { searchParams } = new URL(req.url);

  const rawLimit = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), MAX_LIMIT);

  const rawOffset = parseInt(searchParams.get("offset") ?? "0", 10);
  const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

  const event = searchParams.get("event") ?? undefined;

  const rawUserId = searchParams.get("user_id");
  if (rawUserId !== null && !UUID_RE.test(rawUserId)) {
    return NextResponse.json({ error: "invalid_user_id" }, { status: 400 });
  }
  const userId = rawUserId ?? undefined;

  // — Requête DB via cast non typé ——————————————————————————————————————
  const sb = untypedAdmin();
  if (!sb) {
    // Supabase non configuré → fail-soft
    return NextResponse.json({ rows: [], limit, offset });
  }

  try {
    let query = sb
      .from("auth_audit_log")
      .select("id,user_id,event,ip,user_agent,meta,created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (event !== undefined) {
      query = query.eq("event", event);
    }
    if (userId !== undefined) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error || !data) {
      // Erreur DB ou table absente → fail-soft, jamais 500 sur lecture forensique
      return NextResponse.json({ rows: [], limit, offset });
    }

    return NextResponse.json({ rows: data, limit, offset });
  } catch {
    // Fail-soft total : jamais de 500 sur ce endpoint de lecture
    return NextResponse.json({ rows: [], limit, offset });
  }
}
