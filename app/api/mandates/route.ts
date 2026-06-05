import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data, error } = await sb
    .from("mandates")
    .select("*, properties(title, city)")
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body || !body.property_id) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const {
    property_id,
    kind,
    reference,
    asking_price,
    commission_pct,
    signed_at,
    expires_at,
    status,
    notes,
  } = body;

  const { data, error } = await sb
    .from("mandates")
    .insert({
      user_id: claims.sub,
      tenant_id: tenantOf(claims),
      property_id,
      kind: kind ?? "simple",
      reference: reference ?? null,
      asking_price: asking_price ?? null,
      commission_pct: commission_pct ?? null,
      signed_at: signed_at ?? null,
      expires_at: expires_at ?? null,
      status: status ?? "brouillon",
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "create_failed", detail: error?.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
