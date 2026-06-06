import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const { data, error } = await db
    .from("prosp_criteres_acquereur")
    .select("*")
    .eq("tenant_id", claims.tenant_id)
    .eq("user_id", claims.sub)
    .eq("actif", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body?.nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });

  const { data, error } = await db
    .from("prosp_criteres_acquereur")
    .insert({
      tenant_id:       claims.tenant_id,
      user_id:         claims.sub,
      lead_id:         body.lead_id ?? null,
      nom:             body.nom,
      type_bien:       body.type_bien ?? null,
      budget_min:      body.budget_min ?? null,
      budget_max:      body.budget_max ?? null,
      surface_min:     body.surface_min ?? null,
      surface_max:     body.surface_max ?? null,
      pieces_min:      body.pieces_min ?? null,
      pieces_max:      body.pieces_max ?? null,
      zones:           body.zones ?? [],
      terrasse:        body.terrasse ?? "indifferent",
      parking:         body.parking ?? "indifferent",
      ascenseur:       body.ascenseur ?? "indifferent",
      jardin:          body.jardin ?? "indifferent",
      piscine:         body.piscine ?? "indifferent",
      dpe_max:         body.dpe_max ?? null,
      alerte_email:    body.alerte_email ?? true,
      alerte_whatsapp: body.alerte_whatsapp ?? false,
      telephone:       body.telephone ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { error } = await db
    .from("prosp_criteres_acquereur")
    .update({ actif: false })
    .eq("id", id)
    .eq("tenant_id", claims.tenant_id)
    .eq("user_id", claims.sub);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
