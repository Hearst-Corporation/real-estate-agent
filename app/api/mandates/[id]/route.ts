import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { MANDATE_STATUSES } from "@/lib/crm/format";
import type { TablesUpdate } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    .from("mandates")
    .select("*, properties(title, city)")
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ item: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const allowed = ["kind", "reference", "asking_price", "commission_pct", "signed_at", "expires_at", "status", "notes"];
  const patch: TablesUpdate<"mandates"> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) {
      if (key === "status") {
        const val = body[key];
        if (typeof val !== "string" || !(MANDATE_STATUSES as readonly string[]).includes(val)) {
          return NextResponse.json({ error: "invalid_status" }, { status: 400 });
        }
        (patch as Record<string, unknown>)[key] = val;
      } else {
        (patch as Record<string, unknown>)[key] = (body as Record<string, unknown>)[key];
      }
    }
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("mandates")
    .update(patch)
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .select()
    .single();

  if (error || !data) {
    console.error("[mandates] update failed", { code: error?.code });
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

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
    .from("mandates")
    .delete()
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims));

  if (error) {
    console.error("[mandates] delete failed", { code: error.code });
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
