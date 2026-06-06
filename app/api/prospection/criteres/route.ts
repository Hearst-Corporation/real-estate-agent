import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import type { Tables } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AcquereurCritere = Tables<"prosp_criteres_acquereur">;

async function fetchCriteresRest({
  tenantId,
  userId,
  includeAllTenantUsers,
}: {
  tenantId: string;
  userId: string;
  includeAllTenantUsers: boolean;
}): Promise<{ data: AcquereurCritere[] | null; error: string | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { data: null, error: "supabase_not_configured" };

  const qs = new URLSearchParams({
    select: "*",
    tenant_id: `eq.${tenantId}`,
    actif: "eq.true",
    order: "created_at.desc",
  });
  if (!includeAllTenantUsers) qs.set("user_id", `eq.${userId}`);

  const res = await fetch(`${url}/rest/v1/prosp_criteres_acquereur?${qs}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return { data: null, error: `rest_fetch_failed_${res.status}` };
  return { data: await res.json(), error: null };
}

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });
  const tenantId = tenantOf(claims);

  const buildQuery = () =>
    db
      .from("prosp_criteres_acquereur")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("actif", true)
      .order("created_at", { ascending: false });

  const { data, error } = await buildQuery().eq("user_id", claims.sub);

  if (error) {
    console.error("prospection_criteres_fetch_failed", { tenantId, userId: claims.sub, error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if ((data?.length ?? 0) > 0 || claims.role !== "admin") {
    if ((data?.length ?? 0) > 0) return NextResponse.json({ data });
    const rest = await fetchCriteresRest({ tenantId, userId: claims.sub, includeAllTenantUsers: false });
    if (rest.error) {
      console.error("prospection_criteres_rest_fetch_failed", { tenantId, userId: claims.sub, error: rest.error });
      return NextResponse.json({ data });
    }
    return NextResponse.json({ data: rest.data ?? [] });
  }

  // Admin local : permet de voir les critères importés au niveau tenant sans sortir du tenant.
  const { data: tenantData, error: tenantError } = await buildQuery();
  if (tenantError) {
    console.error("prospection_criteres_tenant_fetch_failed", { tenantId, userId: claims.sub, error: tenantError.message });
    return NextResponse.json({ error: tenantError.message }, { status: 500 });
  }
  if ((tenantData?.length ?? 0) > 0) return NextResponse.json({ data: tenantData });

  const rest = await fetchCriteresRest({ tenantId, userId: claims.sub, includeAllTenantUsers: true });
  if (rest.error) {
    console.error("prospection_criteres_tenant_rest_fetch_failed", { tenantId, userId: claims.sub, error: rest.error });
    return NextResponse.json({ data: tenantData ?? [] });
  }
  return NextResponse.json({ data: rest.data ?? [] });
}

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });
  const tenantId = tenantOf(claims);

  const body = await req.json().catch(() => null);
  if (!body?.nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });

  const { data, error } = await db
    .from("prosp_criteres_acquereur")
    .insert({
      tenant_id:       tenantId,
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
  const tenantId = tenantOf(claims);

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { error } = await db
    .from("prosp_criteres_acquereur")
    .update({ actif: false })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("user_id", claims.sub);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
