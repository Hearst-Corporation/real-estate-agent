import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin, type Gpu1Client } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import type { Tables, TablesInsert } from "@/lib/gpu1/database.types";
import {
  CreateCritereSchema,
  UpdateCritereSchema,
  buildCriterePatch,
} from "@/lib/prospection/criteres-update";

// Les colonnes 0043 (alerte_frequence/urgence/exclusions/criteres_secondaires)
// sont désormais reflétées dans database.types.ts : l'objet d'insert est vérifié
// via `satisfies`. La validation (Zod) + la construction du patch PARTIEL vivent
// dans lib/prospection/criteres-update.ts — MÊME logique que l'interface gateway
// `buyers.update_preferences` (zéro duplication divergente).
type CritereInsert = TablesInsert<"prosp_criteres_acquereur">;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AcquereurCritere = Tables<"prosp_criteres_acquereur">;

// UUID utilisé uniquement pour la validation de l'`id` de suppression (DELETE).
const UUID = z.string().uuid();

async function fetchCriteresRest({
  db,
  tenantId,
  userId,
  includeAllTenantUsers,
}: {
  db: Gpu1Client;
  tenantId: string;
  userId: string;
  includeAllTenantUsers: boolean;
}): Promise<{ data: AcquereurCritere[] | null; error: string | null }> {
  // Filtrage explicite tenant/user conservé (le client admin bypass RLS).
  let query = db
    .from("prosp_criteres_acquereur")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("actif", true)
    .order("created_at", { ascending: false });
  if (!includeAllTenantUsers) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) return { data: null, error: error.code ?? "rest_fetch_failed" };
  return { data: (data as AcquereurCritere[] | null), error: null };
}

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getGpu1Admin();
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
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  if ((data?.length ?? 0) > 0 || claims.role !== "admin") {
    if ((data?.length ?? 0) > 0) return NextResponse.json({ data });
    const rest = await fetchCriteresRest({ db, tenantId, userId: claims.sub, includeAllTenantUsers: false });
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
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
  if ((tenantData?.length ?? 0) > 0) return NextResponse.json({ data: tenantData });

  const rest = await fetchCriteresRest({ db, tenantId, userId: claims.sub, includeAllTenantUsers: true });
  if (rest.error) {
    console.error("prospection_criteres_tenant_rest_fetch_failed", { tenantId, userId: claims.sub, error: rest.error });
    return NextResponse.json({ data: tenantData ?? [] });
  }
  return NextResponse.json({ data: rest.data ?? [] });
}

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });
  const tenantId = tenantOf(claims);

  const raw = await req.json().catch(() => null);
  const parsed = CreateCritereSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message ?? "invalid_body";
    return NextResponse.json({ error: "invalid_body", detail }, { status: 400 });
  }
  const c = parsed.data;
  const typeBien = c.type_bien == null ? null : Array.isArray(c.type_bien) ? c.type_bien : [c.type_bien];

  // Colonnes 0043 (LIVE) incluses ; l'objet est vérifié `satisfies CritereInsert`
  // (les types reflètent maintenant ces colonnes).
  const insertRow = {
    tenant_id:            tenantId,
    user_id:              claims.sub,
    lead_id:              c.lead_id ?? null,
    nom:                  c.nom,
    type_bien:            typeBien,
    budget_min:           c.budget_min ?? null,
    budget_max:           c.budget_max ?? null,
    surface_min:          c.surface_min ?? null,
    surface_max:          c.surface_max ?? null,
    pieces_min:           c.pieces_min ?? null,
    pieces_max:           c.pieces_max ?? null,
    zones:                c.zones ?? [],
    terrasse:             c.terrasse ?? "indifferent",
    parking:              c.parking ?? "indifferent",
    ascenseur:            c.ascenseur ?? "indifferent",
    jardin:               c.jardin ?? "indifferent",
    piscine:              c.piscine ?? "indifferent",
    dpe_max:              c.dpe_max ?? null,
    alerte_email:         c.alerte_email ?? true,
    alerte_whatsapp:      c.alerte_whatsapp ?? false,
    telephone:            c.telephone ?? null,
    // ── 0043 LIVE ──
    alerte_frequence:     c.alerte_frequence ?? "off",
    urgence:              c.urgence ?? null,
    exclusions:           c.exclusions ?? [],
    criteres_secondaires: c.criteres_secondaires ?? {},
  };

  const { data, error } = await db
    .from("prosp_criteres_acquereur")
    .insert(insertRow satisfies CritereInsert)
    .select("*")
    .single();

  if (error) {
    console.error("prospection_criteres_create_failed", { tenantId, userId: claims.sub, error: error.message });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });
  const tenantId = tenantOf(claims);

  const raw = await req.json().catch(() => null);
  const parsed = UpdateCritereSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message ?? "invalid_body";
    return NextResponse.json({ error: "invalid_body", detail }, { status: 400 });
  }
  const { id, ...rest } = parsed.data as { id: string } & Record<string, unknown>;

  // Delta partiel construit par la logique PARTAGÉE (buildCriterePatch) : champs
  // absents non poussés (pas d'écrasement implicite), type_bien normalisé.
  const patch = buildCriterePatch(rest);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  // Owner-check applicatif : user_id (= sub) ET tenant_id.
  const { data, error } = await db
    .from("prosp_criteres_acquereur")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("user_id", claims.sub)
    .select("*")
    .single();

  if (error) {
    console.error("prospection_criteres_update_failed", { tenantId, userId: claims.sub, error: error.message });
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 200 });
}

export async function DELETE(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });
  const tenantId = tenantOf(claims);

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !UUID.safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const { error } = await db
    .from("prosp_criteres_acquereur")
    .update({ actif: false })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("user_id", claims.sub);

  if (error) {
    console.error("prospection_criteres_delete_failed", { tenantId, userId: claims.sub, error: error.message });
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
