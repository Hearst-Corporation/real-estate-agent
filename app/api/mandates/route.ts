import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { captureServer } from "@/lib/providers/posthog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function propertyBelongsToUser(
  sb: ReturnType<typeof getGpu1Admin>,
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
    console.error("[mandates] property ownership check failed", { code: error.code });
    return false;
  }
  return Boolean(data);
}

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const { data, error } = await sb
    .from("mandates")
    .select("*, properties(title, city)")
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[mandates] list failed", { code: error.code });
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body?.property_id) {
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
  const tenantId = tenantOf(claims);

  const ownedProperty = await propertyBelongsToUser(sb, property_id, claims.sub, tenantId);
  if (!ownedProperty) {
    return NextResponse.json({ error: "property_not_found" }, { status: 404 });
  }

  const { data, error } = await sb
    .from("mandates")
    .insert({
      user_id: claims.sub,
      tenant_id: tenantId,
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
    console.error("[mandates] create failed", { code: error?.code });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  captureServer(claims.sub, "mandate_created", { mandate_id: data.id, kind: kind ?? "simple" });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
