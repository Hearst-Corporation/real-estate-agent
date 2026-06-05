/**
 * GET /api/invest/compliance/failed-operations — Dead Letter Queue (Epic 1.6).
 *
 * Renvoie les opérations sortantes en échec définitif (`inv_failed_operations`,
 * Pattern C — 0021) pour traitement/rejeu back-office. Le rejeu est SÛR car les
 * commandes vers les tiers sont idempotentes.
 *
 * GARDE compliance/admin (lecture back-office sensible) :
 *   - 401 sans session ; 503 sans Supabase ;
 *   - 403 si le caller n'est pas compliance/admin.
 * Filtrage `tenant_id` explicite (I9). Filtre optionnel `status`
 * (open|retrying|resolved|abandoned, défaut : tout) et `limit` (défaut 200, max 1000).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const ALLOWED_STATUSES = ["open", "retrying", "resolved", "abandoned"] as const;

const DLQ_COLS =
  "id, tenant_id, deal_id, subscription_id, op_kind, payload, attempts, last_error, " +
  "status, resolved_at, resolved_by, created_at, updated_at";

export async function GET(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // Garde rôle : compliance / admin uniquement.
  const isAllowed =
    claims.role === "admin" ||
    claims.role === "compliance" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("compliance");
  if (!isAllowed) {
    return NextResponse.json(
      { error: "forbidden", detail: "compliance_or_admin_required" },
      { status: 403 },
    );
  }

  const tenantId = tenantOf(claims);
  const url = req.nextUrl;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const statusFilter = url.searchParams.get("status");

  try {
    let q = sb
      .from("inv_failed_operations")
      .select(DLQ_COLS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (statusFilter && (ALLOWED_STATUSES as readonly string[]).includes(statusFilter)) {
      q = q.eq("status", statusFilter);
    }

    const { data, error } = await q;
    if (error) throw error;
    const items = (data as unknown[]) ?? [];

    // Compteur d'ouvertes (alerte back-office) — léger, séparé du listing.
    const { count: openCount } = await sb
      .from("inv_failed_operations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "open");

    return NextResponse.json(
      { items, returned: items.length, openCount: openCount ?? 0 },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "dlq_read_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
