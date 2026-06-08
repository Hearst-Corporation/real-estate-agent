import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { captureServer } from "@/lib/providers/posthog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function propertyBelongsToUser(
  sb: ReturnType<typeof getSupabaseAdmin>,
  propertyId: string,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  if (!sb) return false;
  const { data, error } = await sb
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    console.error("[visits] property ownership check failed", { code: error.code });
    return false;
  }
  return Boolean(data);
}

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data, error } = await sb
    .from("visits")
    .select("*, properties(title, city)")
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .order("scheduled_at", { ascending: true });

  if (error) return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body || !body.property_id || !body.scheduled_at) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { property_id, scheduled_at, lead_id, duration_min, status, notes } = body;
  const tenantId = tenantOf(claims);

  const ownedProperty = await propertyBelongsToUser(sb, property_id, claims.sub, tenantId);
  if (!ownedProperty) {
    return NextResponse.json({ error: "property_not_found" }, { status: 404 });
  }

  const { data, error } = await sb
    .from("visits")
    .insert({
      user_id: claims.sub,
      tenant_id: tenantId,
      property_id,
      scheduled_at,
      lead_id: lead_id ?? null,
      duration_min: duration_min ?? 30,
      status: status ?? "planifiee",
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "create_failed", detail: error?.message }, { status: 500 });
  }

  captureServer(claims.sub, "visit_created", { visit_id: data.id });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
