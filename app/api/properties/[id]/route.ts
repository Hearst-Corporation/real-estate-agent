import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { PROPERTY_STATUSES } from "@/lib/crm/format";
import type { TablesUpdate } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET /api/properties/[id] — détail d'un bien ─────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { id } = await params;

  const { data, error } = await sb
    .from("properties")
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

// ─── PATCH /api/properties/[id] — mise à jour partielle ──────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Whitelist des champs modifiables
  const allowed = [
    "status",
    "title",
    "property_type",
    "address",
    "city",
    "postal_code",
    "surface",
    "rooms",
    "bedrooms",
    "asking_price",
    "estimated_value",
    "estimation_id",
    "notes",
  ];
  const patch: TablesUpdate<"properties"> = {};
  for (const key of allowed) {
    if (key in body) {
      if (key === "status") {
        const val = body[key];
        if (typeof val !== "string" || !(PROPERTY_STATUSES as readonly string[]).includes(val)) {
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
    .from("properties")
    .update(patch)
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "update_failed", detail: error?.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

// ─── DELETE /api/properties/[id] — suppression ───────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { id } = await params;

  const { error } = await sb
    .from("properties")
    .delete()
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims));

  if (error) {
    return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
