import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { propertyRowToPropertyData } from "@/lib/estimation/from-property";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Body optionnel : { property_id } pour préremplir depuis un bien CRM.
const CreateBodySchema = z
  .object({
    property_id: z.string().uuid().optional(),
  })
  .strict();

// ─── POST /api/estimations — créer une estimation draft ───────────────────────

export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  // Body optionnel : requête sans corps (JSON vide/invalide) → brouillon vide.
  const raw = await req.json().catch(() => ({}));
  const parsed = CreateBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const propertyId = parsed.data.property_id;

  // ── Branche PRÉREMPLIE : estimation lancée depuis un bien CRM ───────────────
  if (propertyId) {
    // Owner-check strict : le bien doit appartenir à user+tenant, sinon 404
    // (pas de fuite d'existence).
    const { data: property, error: propErr } = await sb
      .from("properties")
      .select("*")
      .eq("id", propertyId)
      .eq("user_id", userId)
      .eq("tenant_id", tenant)
      .maybeSingle();

    if (propErr) {
      console.error("[estimations POST] property_load_failed:", propErr);
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
    if (!property) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const propertyData = propertyRowToPropertyData(property);

    const { data: created, error: insErr } = await sb
      .from("estimations")
      .insert({
        user_id: userId,
        tenant_id: tenant,
        status: "draft",
        property_id: propertyId,
        property: propertyData,
      })
      .select("id")
      .single();

    if (insErr || !created) {
      console.error("[estimations POST] prefilled_create_failed:", insErr);
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }

    // Rattachement bidirectionnel : le bien pointe vers sa nouvelle estimation.
    // Owner-check maintenu. Best-effort : si l'update échoue, l'estimation
    // existe déjà — on log sans casser le parcours.
    const { error: linkErr } = await sb
      .from("properties")
      .update({ estimation_id: created.id })
      .eq("id", propertyId)
      .eq("user_id", userId)
      .eq("tenant_id", tenant);
    if (linkErr) {
      console.error("[estimations POST] property_link_failed:", linkErr);
    }

    return NextResponse.json({ id: created.id }, { status: 201 });
  }

  // ── Branche BROUILLON VIDE (comportement historique inchangé) ───────────────

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
    console.error("[estimations POST] create_failed:", error);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
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
    console.error("[estimations GET] fetch_failed:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  return NextResponse.json({ estimations: data ?? [] });
}
