/**
 * POST /api/estimations/[id]/mandate
 *
 * Crée une OPPORTUNITÉ DE MANDAT (mandat status='brouillon') à partir d'une
 * estimation — étape « opportunité » du parcours commercial (LIVE, pas fake).
 *
 * Un mandat se rattache à un BIEN. Si l'estimation n'a pas encore de fiche bien
 * (`property_id` null), on la crée depuis les données de l'estimation (adresse,
 * type, surface, prix conseillé) et on lie les deux (`estimations.property_id`
 * ↔ `properties.estimation_id`). Le prix demandé du mandat = prix de mise en
 * vente conseillé du moteur (LIVE), sinon la valeur de marché.
 *
 * Owner-check user+tenant partout, Zod, IDs crypto.randomUUID côté DB.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import { loadContinuity } from "@/lib/estimation/continuity";
import { rateLimit } from "@/lib/ratelimit";
import type { PropertyData, Valuation } from "@/lib/estimation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANDATE_KINDS = ["simple", "exclusif", "semi_exclusif"] as const;

const MandateSchema = z
  .object({
    kind: z.enum(MANDATE_KINDS).optional(),
    commission_pct: z.number().finite().min(0).max(100).nullish(),
  })
  .strict();

/** Libellé de bien depuis la property d'estimation (jamais vide). */
function propertyTitle(p: PropertyData): string {
  const type = p.type_bien ?? "bien";
  const where = p.ville ?? p.adresse ?? null;
  return where ? `${type} — ${where}` : type;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  // ── Auth ────────────────────────────────────────────────────────────────
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  // ── Ownership de l'estimation ───────────────────────────────────────────
  const estimation = await loadOwnedEstimation(sb, id, userId, tenant);
  if (!estimation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // ── Rate-limit ──────────────────────────────────────────────────────────
  if (!(await rateLimit(`estimation-mandate:${userId}`, 10, 60))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // ── Validation ──────────────────────────────────────────────────────────
  const raw = await req.json().catch(() => null);
  const parsed = MandateSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message ?? "invalid_body";
    return NextResponse.json({ error: "invalid_body", detail }, { status: 400 });
  }
  const input = parsed.data;

  const property = (estimation.property ?? {}) as PropertyData;
  const valuation = (estimation.valuation ?? null) as Valuation | null;
  const askingPrice =
    valuation?.recommendedListingPrice ||
    valuation?.marketValue ||
    (estimation.recommended_price as number | null) ||
    (estimation.market_value as number | null) ||
    null;

  // ── 1) Assure la fiche BIEN (crée + lie si absente) ─────────────────────
  let propertyId = estimation.property_id as string | null;
  if (!propertyId) {
    const { data: propRow, error: propErr } = await sb
      .from("properties")
      .insert({
        user_id: userId,
        tenant_id: tenant,
        title: propertyTitle(property),
        property_type: property.type_bien ?? "autre",
        address: property.adresse ?? "",
        city: property.ville ?? "",
        postal_code: property.code_postal ?? "",
        surface:
          property.surface_habitable_m2 ?? property.surface_carrez_m2 ?? null,
        rooms: property.nombre_pieces ?? null,
        bedrooms: property.nombre_chambres ?? null,
        asking_price: askingPrice,
        estimated_value: (estimation.market_value as number | null) ?? null,
        estimation_id: id,
        status: "prospect",
      })
      .select("id")
      .single();

    if (propErr || !propRow) {
      console.error("estimation_mandate_create_property_failed", {
        estimationId: id,
        userId,
        error: propErr?.message,
      });
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
    propertyId = propRow.id;

    // Lie l'estimation au bien créé (parcours réversible côté fiche bien).
    const { error: linkErr } = await sb
      .from("estimations")
      .update({ property_id: propertyId })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("tenant_id", tenant);
    if (linkErr) {
      console.error("estimation_mandate_link_property_failed", {
        estimationId: id,
        userId,
        error: linkErr.message,
      });
      // Le bien existe déjà : on continue, le mandat reste rattachable.
    }
  }

  // ── 2) Crée l'opportunité de mandat (brouillon) ─────────────────────────
  const { data: mandateRow, error: mandateErr } = await sb
    .from("mandates")
    .insert({
      user_id: userId,
      tenant_id: tenant,
      property_id: propertyId,
      status: "brouillon",
      kind: input.kind ?? "simple",
      asking_price: askingPrice,
      commission_pct: input.commission_pct ?? null,
    })
    .select("id")
    .single();

  if (mandateErr || !mandateRow) {
    console.error("estimation_mandate_create_failed", {
      estimationId: id,
      userId,
      error: mandateErr?.message,
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  const continuity = await loadContinuity(sb, id, userId, tenant);
  return NextResponse.json(
    { ok: true, mandateId: mandateRow.id, propertyId, continuity },
    { status: 201 }
  );
}
