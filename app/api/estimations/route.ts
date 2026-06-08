import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── POST /api/estimations — créer une estimation draft ───────────────────────

export async function POST() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  // Un draft vierge (property/field_status vides) est réutilisable : on n'en
  // empile jamais deux. Protège contre le double-montage Strict Mode, le
  // double-clic et le retour navigateur sur /estimations/new.
  const findBlankDraft = () =>
    sb
      .from("estimations")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", tenant)
      .eq("status", "draft")
      .eq("property", "{}")
      .eq("field_status", "{}")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  const { data: reusable } = await findBlankDraft();
  if (reusable) {
    return NextResponse.json({ id: reusable.id }, { status: 200 });
  }

  const { data, error } = await sb
    .from("estimations")
    .insert({
      user_id: userId,
      tenant_id: tenant,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) {
    // Course perdue contre l'index unique partiel estimations_one_blank_draft_per_user
    // → un autre INSERT concurrent a créé le draft : on renvoie le gagnant.
    if (error?.code === "23505") {
      const { data: winner } = await findBlankDraft();
      if (winner) return NextResponse.json({ id: winner.id }, { status: 200 });
    }
    return NextResponse.json({ error: "create_failed", detail: error?.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}

// ─── GET /api/estimations — liste des estimations de l'utilisateur ────────────

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  const { data, error } = await sb
    .from("estimations")
    .select("id, status, city, property_type, market_value, updated_at")
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ estimations: data ?? [] });
}
