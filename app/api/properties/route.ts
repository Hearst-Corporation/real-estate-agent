import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET /api/properties — liste des biens de l'utilisateur ──────────────────

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data, error } = await sb
    .from("properties")
    .select(
      "id, status, title, property_type, address, city, postal_code, surface, rooms, bedrooms, asking_price, estimated_value, estimation_id, notes, created_at, updated_at"
    )
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[properties] list failed", { code: error.code });
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

// ─── POST /api/properties — créer un bien ────────────────────────────────────

export async function POST(request: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { title, property_type, address, city, postal_code } = body as {
    title?: string;
    property_type?: string;
    address?: string;
    city?: string;
    postal_code?: string;
  };

  if (!title || !property_type || !address || !city || !postal_code) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { surface, rooms, bedrooms, asking_price, notes } = body as {
    surface?: number;
    rooms?: number;
    bedrooms?: number;
    asking_price?: number;
    notes?: string;
  };

  const status = (body.status as string) ?? "prospect";

  const { data, error } = await sb
    .from("properties")
    .insert({
      user_id: claims.sub,
      tenant_id: tenantOf(claims),
      status,
      title,
      property_type,
      address,
      city,
      postal_code,
      surface: surface ?? null,
      rooms: rooms ?? null,
      bedrooms: bedrooms ?? null,
      asking_price: asking_price ?? null,
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[properties] create failed", { code: error?.code });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
