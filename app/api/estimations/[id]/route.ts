/**
 * PATCH /api/estimations/[id]
 *
 * Suivi de décision commerciale + ajustements manuels tracés (colonnes 0043,
 * LIVE). N'affecte JAMAIS le moteur de valorisation — seulement la couche suivi.
 *
 * Actions (mutuellement exclusives, une par requête) :
 *   - { action:"decision", decision, next_action? } → statut du parcours
 *   - { action:"next_action", next_action }         → prochaine action commerciale
 *   - { action:"add_adjustment", label, pct?|eur?, raison } → ajout tracé (auteur+date)
 *   - { action:"remove_adjustment", adjustment_id }  → retrait d'un ajustement manuel
 *
 * Owner-check user+tenant, Zod, IDs crypto.randomUUID, erreurs génériques.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import {
  DECISIONS,
  loadContinuity,
  parseManualAdjustments,
  updateContinuityColumns,
  type ManualAdjustment,
} from "@/lib/estimation/continuity";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NEXT_ACTION_MAX = 500;
const ADJ_LABEL_MAX = 120;
const ADJ_RAISON_MAX = 500;
const ADJ_PCT_MIN = -90;
const ADJ_PCT_MAX = 100;
const ADJ_EUR_MIN = -100_000_000;
const ADJ_EUR_MAX = 100_000_000;
const MANUAL_ADJ_MAX = 30;

const DecisionAction = z
  .object({
    action: z.literal("decision"),
    decision: z.enum(DECISIONS),
    next_action: z.string().trim().max(NEXT_ACTION_MAX).nullish(),
  })
  .strict();

const NextActionAction = z
  .object({
    action: z.literal("next_action"),
    next_action: z.string().trim().max(NEXT_ACTION_MAX).nullable(),
  })
  .strict();

const AddAdjustmentAction = z
  .object({
    action: z.literal("add_adjustment"),
    label: z.string().trim().min(1).max(ADJ_LABEL_MAX),
    pct: z.number().finite().min(ADJ_PCT_MIN).max(ADJ_PCT_MAX).nullish(),
    eur: z.number().finite().min(ADJ_EUR_MIN).max(ADJ_EUR_MAX).nullish(),
    raison: z.string().trim().min(1).max(ADJ_RAISON_MAX),
  })
  .strict()
  // Exactement UNE unité (pct OU eur), non nulle.
  .refine(
    (v) => (v.pct != null && v.pct !== 0) !== (v.eur != null && v.eur !== 0),
    { message: "adjustment_unit_required", path: ["pct"] }
  );

const RemoveAdjustmentAction = z
  .object({
    action: z.literal("remove_adjustment"),
    adjustment_id: z.string().min(1).max(64),
  })
  .strict();

const PatchSchema = z.discriminatedUnion("action", [
  DecisionAction,
  NextActionAction,
  AddAdjustmentAction,
  RemoveAdjustmentAction,
]);

export async function PATCH(
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

  // ── Ownership ───────────────────────────────────────────────────────────
  const estimation = await loadOwnedEstimation(sb, id, userId, tenant);
  if (!estimation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // ── Rate-limit ──────────────────────────────────────────────────────────
  if (!(await rateLimit(`estimation-patch:${userId}`, 20, 60))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // ── Validation ──────────────────────────────────────────────────────────
  const raw = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message ?? "invalid_body";
    return NextResponse.json({ error: "invalid_body", detail }, { status: 400 });
  }
  const input = parsed.data;

  // ── Application ─────────────────────────────────────────────────────────
  if (input.action === "decision") {
    const ok = await updateContinuityColumns(sb, id, userId, tenant, {
      decision: input.decision,
      ...(input.next_action !== undefined
        ? { next_action: input.next_action ?? null }
        : {}),
    });
    if (!ok) return NextResponse.json({ error: "Internal error" }, { status: 500 });
  } else if (input.action === "next_action") {
    const ok = await updateContinuityColumns(sb, id, userId, tenant, {
      next_action: input.next_action,
    });
    if (!ok) return NextResponse.json({ error: "Internal error" }, { status: 500 });
  } else if (input.action === "add_adjustment") {
    // Read-modify-write : on relit la liste possédée avant d'ajouter.
    // `manual_adjustments` (colonne 0043) typée sur la Row estimations.
    const current = parseManualAdjustments(estimation.manual_adjustments);
    if (current.length >= MANUAL_ADJ_MAX) {
      return NextResponse.json({ error: "too_many_adjustments" }, { status: 409 });
    }
    const auteur = claims.email ?? "agent";
    const next: ManualAdjustment = {
      id: crypto.randomUUID(),
      label: input.label,
      pct: input.pct ?? null,
      eur: input.eur ?? null,
      raison: input.raison,
      auteur,
      date: new Date().toISOString(),
    };
    const ok = await updateContinuityColumns(sb, id, userId, tenant, {
      manual_adjustments: [...current, next],
    });
    if (!ok) return NextResponse.json({ error: "Internal error" }, { status: 500 });
  } else {
    // remove_adjustment
    const current = parseManualAdjustments(estimation.manual_adjustments);
    const filtered = current.filter((a) => a.id !== input.adjustment_id);
    const ok = await updateContinuityColumns(sb, id, userId, tenant, {
      manual_adjustments: filtered,
    });
    if (!ok) return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  const continuity = await loadContinuity(sb, id, userId, tenant);
  return NextResponse.json({ ok: true, continuity }, { status: 200 });
}
