import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { VISIT_STATUSES } from "@/lib/crm/format";
import type { TablesUpdate } from "@/lib/gpu1/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const { data, error } = await sb
    .from("visits")
    .select("*, properties(title, city)")
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .single();

  if (error) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ item: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const allowed = ["status", "feedback", "notes", "scheduled_at", "duration_min", "lead_id"];
  const patch: TablesUpdate<"visits"> = {};
  for (const key of allowed) {
    if (key in body) {
      if (key === "status") {
        const val = body[key];
        if (typeof val !== "string" || !(VISIT_STATUSES as readonly string[]).includes(val)) {
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

  // Rattachement de lead : owner-check applicatif (service-role bypasse la RLS).
  // Un lead_id null détache la visite — autorisé sans vérif.
  if (typeof patch.lead_id === "string" && patch.lead_id) {
    const { data: ownedLead } = await sb
      .from("leads")
      .select("id")
      .eq("id", patch.lead_id)
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .maybeSingle();
    if (!ownedLead) {
      return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
    }
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from("visits")
    .update(patch)
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .select("id")
    .single();

  if (error || !data) {
    console.error("[visits] update failed", { code: error?.code });
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const { error } = await sb
    .from("visits")
    .delete()
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims));

  if (error) {
    console.error("[visits] delete failed", { code: error.code });
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
