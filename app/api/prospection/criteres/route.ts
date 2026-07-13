import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import type { Tables } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AcquereurCritere = Tables<"prosp_criteres_acquereur">;

// ─── Validation input critères (Zod) ────────────────────────────────────────
// Bornes : budget/surface/pièces ≥ 0 finis ; min ≤ max ; zone (via lead_id/zones)
// non totalement vide ; coordonnées valides si fournies ; préférences en enum
// must-have/preferred/excluded (miroir CHECK DB : 'indifferent'|'requis'|'exclu').
const PREF = z.enum(["indifferent", "requis", "exclu"]);
const UUID = z.string().uuid();

// Une zone géographique optionnellement géolocalisée : label + coords + rayon.
const ZoneSchema = z
  .object({
    label: z.string().trim().min(1).optional(),
    cp: z.string().trim().min(1).optional(),
    ville: z.string().trim().min(1).optional(),
    lat: z.number().finite().min(-90).max(90).optional(),
    lng: z.number().finite().min(-180).max(180).optional(),
    rayon_km: z.number().finite().nonnegative().optional(),
  })
  .strict()
  .refine((z) => !!(z.label || z.cp || z.ville), {
    message: "zone_empty",
  })
  // lat sans lng (ou l'inverse) = coordonnée invalide.
  .refine((z) => (z.lat === undefined) === (z.lng === undefined), {
    message: "coords_invalid",
  });

const PosNum = z.number().finite().nonnegative();
const PosInt = z.number().int().finite().nonnegative();

const CreateCritereSchema = z
  .object({
    nom: z.string().trim().min(1).max(200),
    lead_id: UUID.nullish(),
    type_bien: z.union([z.array(z.string().trim().min(1)), z.string().trim().min(1)]).nullish(),
    budget_min: PosNum.nullish(),
    budget_max: PosNum.nullish(),
    surface_min: PosNum.nullish(),
    surface_max: PosNum.nullish(),
    pieces_min: PosInt.nullish(),
    pieces_max: PosInt.nullish(),
    zones: z.array(ZoneSchema).max(50).optional(),
    terrasse: PREF.optional(),
    parking: PREF.optional(),
    ascenseur: PREF.optional(),
    jardin: PREF.optional(),
    piscine: PREF.optional(),
    dpe_max: z.string().trim().min(1).max(2).nullish(),
    alerte_email: z.boolean().optional(),
    alerte_whatsapp: z.boolean().optional(),
    telephone: z.string().trim().min(1).max(32).nullish(),
  })
  .strict()
  .refine((v) => v.budget_min == null || v.budget_max == null || v.budget_min <= v.budget_max, {
    message: "budget_range_invalid",
    path: ["budget_min"],
  })
  .refine((v) => v.surface_min == null || v.surface_max == null || v.surface_min <= v.surface_max, {
    message: "surface_range_invalid",
    path: ["surface_min"],
  })
  .refine((v) => v.pieces_min == null || v.pieces_max == null || v.pieces_min <= v.pieces_max, {
    message: "pieces_range_invalid",
    path: ["pieces_min"],
  });

export type CreateCritereInput = z.infer<typeof CreateCritereSchema>;

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
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
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
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
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

  const raw = await req.json().catch(() => null);
  const parsed = CreateCritereSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const c = parsed.data;
  const typeBien = c.type_bien == null ? null : Array.isArray(c.type_bien) ? c.type_bien : [c.type_bien];

  const { data, error } = await db
    .from("prosp_criteres_acquereur")
    .insert({
      tenant_id:       tenantId,
      user_id:         claims.sub,
      lead_id:         c.lead_id ?? null,
      nom:             c.nom,
      type_bien:       typeBien,
      budget_min:      c.budget_min ?? null,
      budget_max:      c.budget_max ?? null,
      surface_min:     c.surface_min ?? null,
      surface_max:     c.surface_max ?? null,
      pieces_min:      c.pieces_min ?? null,
      pieces_max:      c.pieces_max ?? null,
      zones:           c.zones ?? [],
      terrasse:        c.terrasse ?? "indifferent",
      parking:         c.parking ?? "indifferent",
      ascenseur:       c.ascenseur ?? "indifferent",
      jardin:          c.jardin ?? "indifferent",
      piscine:         c.piscine ?? "indifferent",
      dpe_max:         c.dpe_max ?? null,
      alerte_email:    c.alerte_email ?? true,
      alerte_whatsapp: c.alerte_whatsapp ?? false,
      telephone:       c.telephone ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("prospection_criteres_create_failed", { tenantId, userId: claims.sub, error: error.message });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
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
