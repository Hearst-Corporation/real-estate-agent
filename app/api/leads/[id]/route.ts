import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { LEAD_STATUSES } from "@/lib/crm/format";
import type { TablesUpdate } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET /api/leads/[id] ──────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { id } = await params;

  const { data, error } = await sb
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ item: data });
}

// ─── PATCH /api/leads/[id] ────────────────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Champs patchables — full_name ne peut pas être mis à vide
  const allowed = ["full_name", "kind", "type_personne", "email", "phone", "source", "budget_min", "budget_max", "status", "notes", "property_id"] as const;
  const patch: TablesUpdate<"leads"> = {};
  for (const key of allowed) {
    if (key in body) {
      if (key === "full_name") {
        const val = body[key];
        if (typeof val !== "string" || (val as string).trim() === "") {
          return NextResponse.json({ error: "invalid_body" }, { status: 400 });
        }
        (patch as Record<string, unknown>)[key] = (val as string).trim();
      } else if (key === "status") {
        const val = body[key];
        if (typeof val !== "string" || !(LEAD_STATUSES as readonly string[]).includes(val)) {
          return NextResponse.json({ error: "invalid_status" }, { status: 400 });
        }
        (patch as Record<string, unknown>)[key] = val;
      } else {
        (patch as Record<string, unknown>)[key] = body[key];
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("leads")
    .update(patch)
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .select("id")
    .single();

  if (error || !data) {
    console.error("[leads] update failed", { code: error?.code });
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

// ─── DELETE /api/leads/[id] ───────────────────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { id } = await params;

  const { error } = await sb
    .from("leads")
    .delete()
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims));

  if (error) {
    console.error("[leads] delete failed", { code: error.code });
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
