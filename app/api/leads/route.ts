import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { captureServer } from "@/lib/providers/posthog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LEADS_LIMIT = 200;

// ─── GET /api/leads — liste des leads de l'utilisateur ───────────────────────

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data, error } = await sb
    .from("leads")
    .select("id, full_name, email, phone, status, kind, type_personne, source, budget_min, budget_max, property_id, notes, created_at, updated_at")
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .order("updated_at", { ascending: false })
    .limit(DEFAULT_LEADS_LIMIT);

  if (error) {
    return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

// ─── POST /api/leads — créer un lead ─────────────────────────────────────────

export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { full_name, kind, type_personne, email, phone, source, budget_min, budget_max, status } = body as {
    full_name?: string;
    kind?: string;
    type_personne?: string;
    email?: string;
    phone?: string;
    source?: string;
    budget_min?: number;
    budget_max?: number;
    status?: string;
  };

  if (!full_name || typeof full_name !== "string" || full_name.trim() === "") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("leads")
    .insert({
      user_id: claims.sub,
      tenant_id: tenantOf(claims),
      full_name: full_name.trim(),
      kind: kind ?? "acheteur",
      ...(type_personne ? { type_personne } : {}),
      email: email ?? null,
      phone: phone ?? null,
      source: source ?? null,
      budget_min: budget_min ?? null,
      budget_max: budget_max ?? null,
      status: status ?? "nouveau",
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "create_failed", detail: error?.message }, { status: 500 });
  }

  captureServer(claims.sub, "lead_created", { lead_id: data.id, kind: kind ?? "acheteur" });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
