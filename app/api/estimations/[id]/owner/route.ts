/**
 * /api/estimations/[id]/owner
 *
 * Rattache un PROPRIÉTAIRE (lead vendeur) à une estimation — début du parcours
 * commercial.
 *
 * GET  → liste les leads vendeur possédés (pour le picker « lier un existant »).
 * POST → deux modes :
 *   - mode="create" : crée un nouveau lead kind=vendeur (user_id + tenant_id posés).
 *   - mode="link"   : rattache un lead vendeur existant (owner-check préalable).
 *
 * Écrit `estimations.owner_lead_id` (LIVE). Owner-check user+tenant partout, Zod,
 * jamais de service-role côté client, IDs crypto.randomUUID côté DB.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import { updateContinuityColumns, loadContinuity } from "@/lib/estimation/continuity";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateOwnerSchema = z
  .object({
    mode: z.literal("create"),
    full_name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320).nullish(),
    phone: z.string().trim().min(1).max(32).nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .strict();

const LinkOwnerSchema = z
  .object({
    mode: z.literal("link"),
    lead_id: z.string().uuid(),
  })
  .strict();

const OwnerSchema = z.discriminatedUnion("mode", [CreateOwnerSchema, LinkOwnerSchema]);

const VENDEUR_LIST_LIMIT = 50;

/** GET — leads vendeur possédés (picker « lier un propriétaire existant »). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = getGpu1Admin();
  if (!sb) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  const userId = claims.sub;
  const tenant = tenantOf(claims);

  // Ownership de l'estimation (ne liste pas les leads d'une estimation étrangère).
  const estimation = await loadOwnedEstimation(sb, id, userId, tenant);
  if (!estimation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data, error } = await sb
    .from("leads")
    .select("id, full_name, email, phone")
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .eq("kind", "vendeur")
    .order("created_at", { ascending: false })
    .limit(VENDEUR_LIST_LIMIT);

  if (error) {
    console.error("estimation_owner_list_failed", { estimationId: id, userId, error: error.message });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ leads: data ?? [] }, { status: 200 });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  // ── Auth (avant tout accès DB) ──────────────────────────────────────────
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = getGpu1Admin();
  if (!sb) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  // ── Ownership de l'estimation ───────────────────────────────────────────
  const estimation = await loadOwnedEstimation(sb, id, userId, tenant);
  if (!estimation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // ── Rate-limit (10 / 60 s) ──────────────────────────────────────────────
  if (!(await rateLimit(`estimation-owner:${userId}`, 10, 60))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // ── Validation ──────────────────────────────────────────────────────────
  const raw = await req.json().catch(() => null);
  const parsed = OwnerSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message ?? "invalid_body";
    return NextResponse.json({ error: "invalid_body", detail }, { status: 400 });
  }
  const input = parsed.data;

  let ownerLeadId: string;

  if (input.mode === "create") {
    // Crée un lead VENDEUR (le propriétaire) avec owner-scope explicite.
    const { data: leadRow, error: leadErr } = await sb
      .from("leads")
      .insert({
        user_id: userId,
        tenant_id: tenant,
        full_name: input.full_name,
        kind: "vendeur",
        status: "nouveau",
        email: input.email ?? null,
        phone: input.phone ?? null,
        source: "estimation",
        notes: input.notes ?? null,
      })
      .select("id")
      .single();

    if (leadErr || !leadRow) {
      console.error("estimation_owner_create_lead_failed", {
        estimationId: id,
        userId,
        error: leadErr?.message,
      });
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
    ownerLeadId = leadRow.id;
  } else {
    // Lien : vérifie que le lead existe ET appartient à user+tenant.
    const { data: leadRow, error: leadErr } = await sb
      .from("leads")
      .select("id, kind")
      .eq("id", input.lead_id)
      .eq("user_id", userId)
      .eq("tenant_id", tenant)
      .maybeSingle();

    if (leadErr) {
      console.error("estimation_owner_link_lookup_failed", {
        estimationId: id,
        userId,
        error: leadErr.message,
      });
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
    if (!leadRow) {
      return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
    }
    ownerLeadId = leadRow.id;
  }

  // ── Rattache à l'estimation ─────────────────────────────────────────────
  const ok = await updateContinuityColumns(sb, id, userId, tenant, {
    owner_lead_id: ownerLeadId,
  });
  if (!ok) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // Renvoie l'état de continuité à jour (owner joint) pour rafraîchir l'UI sans reload.
  const continuity = await loadContinuity(sb, id, userId, tenant);
  return NextResponse.json({ ok: true, continuity }, { status: 200 });
}
