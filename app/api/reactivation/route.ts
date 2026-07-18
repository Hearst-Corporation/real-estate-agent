/**
 * /api/reactivation — réactivation des prospects dormants (W2).
 *
 *   GET  : liste owner-scopée des prospects (acquéreurs + propriétaires) sans
 *          activité récente (seuil configurable `?days=`), avec explication
 *          déterministe et biens pertinents. LECTURE seule, aucun envoi.
 *   POST : crée un BROUILLON personnalisé dans l'outbox (status='draft').
 *          JAMAIS d'envoi — HITL obligatoire dans l'Outbox. Table outbox_drafts
 *          absente (0050 non appliquée) → UNAVAILABLE honnête (503).
 *
 * Fail-closed : 401 avant tout accès DB, owner-check tenant_id + user_id sur
 * CHAQUE requête (admin token bypass RLS → filtrage explicite), Zod strict,
 * IDs crypto.randomUUID(), erreurs génériques 500. Aucun secret renvoyé.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin, type Gpu1Client } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import {
  DORMANT_THRESHOLD_DAYS,
  DORMANT_THRESHOLD_MIN_DAYS,
  DORMANT_THRESHOLD_MAX_DAYS,
  REACTIVATION_SECTION_LIMIT,
} from "@/config/reactivation";
import {
  detectDormant,
  type LeadRow,
  type CritereRow,
  type MandateRow,
  type VisitRow,
  type PropertyRow,
} from "@/lib/reactivation/detect";
import { buildDraft } from "@/lib/reactivation/draft";
import type { DormantProspect } from "@/lib/reactivation/types";
import { OUTBOX_CHANNELS, isSchemaMissing, type OutboxChannel } from "@/lib/outbox/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Codes PostgREST/Postgres « relation/colonne absente » → dégradation propre. */
function schemaMissing(error: { code?: string } | null): boolean {
  const code = String(error?.code ?? "");
  return code === "42P01" || code === "42703";
}

export type ReactivationResponse = {
  threshold_days: number;
  prospects: DormantProspect[];
};

function clampThreshold(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return DORMANT_THRESHOLD_DAYS;
  return Math.max(DORMANT_THRESHOLD_MIN_DAYS, Math.min(n, DORMANT_THRESHOLD_MAX_DAYS));
}

export async function GET(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);
  const userId = claims.sub;
  const now = new Date();
  const thresholdDays = clampThreshold(new URL(req.url).searchParams.get("days"));

  try {
    // Toutes les lectures sont owner-scopées (tenant_id + user_id).
    const [leadsRes, mandatesRes, visitsRes, propsRes] = await Promise.all([
      db
        .from("leads")
        .select("id,full_name,email,phone,kind,status,updated_at,created_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .order("updated_at", { ascending: true })
        .limit(2000),
      db
        .from("mandates")
        .select("id,reference,kind,status,property_id,asking_price,signed_at,updated_at,created_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .order("updated_at", { ascending: true })
        .limit(2000),
      db
        .from("visits")
        .select("lead_id,scheduled_at,updated_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .limit(4000),
      db
        .from("properties")
        .select("id,title,city,postal_code,asking_price,property_type,surface,rooms,status")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .limit(2000),
    ]);

    // Une table métier de base absente = incohérence d'environnement → 500 générique.
    for (const r of [leadsRes, mandatesRes, visitsRes, propsRes]) {
      if (r.error && !schemaMissing(r.error)) {
        console.error("reactivation_fetch_failed", { tenantId, error: r.error.message });
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    }

    // Critères acquéreur (table prospection, peut être absente → tolérée).
    const critRes = await db
      .from("prosp_criteres_acquereur")
      .select(
        "id,lead_id,nom,telephone,actif,type_bien,budget_min,budget_max,surface_min,surface_max,pieces_min,zones,updated_at,created_at",
      )
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .limit(2000);
    if (critRes.error && !schemaMissing(critRes.error)) {
      console.error("reactivation_criteres_failed", { tenantId, error: critRes.error.message });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const prospects = detectDormant({
      leads: (leadsRes.data ?? []) as LeadRow[],
      criteres: (critRes.data ?? []) as CritereRow[],
      mandates: (mandatesRes.data ?? []) as MandateRow[],
      visits: (visitsRes.data ?? []) as VisitRow[],
      messages: [],
      properties: (propsRes.data ?? []) as PropertyRow[],
      thresholdDays,
      now,
    }).slice(0, REACTIVATION_SECTION_LIMIT);

    const body: ReactivationResponse = { threshold_days: thresholdDays, prospects };
    return NextResponse.json(body);
  } catch (e) {
    console.error("reactivation_block_failed", { tenantId, error: String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── POST : matérialise un BROUILLON dans l'outbox (jamais d'envoi) ─────────────

const CreateDraftSchema = z.object({
  /** source_id du candidat (lead/critère/mandat) — sert de garde d'existence. */
  source_id: z.string().uuid(),
  role: z.enum(["acquereur", "proprietaire"]),
  lead_id: z.string().uuid().nullable().optional(),
  channel: z
    .enum(OUTBOX_CHANNELS as unknown as [OutboxChannel, ...OutboxChannel[]])
    .optional(),
  /** seuil ayant produit la détection (recalcul serveur, jamais confiance client). */
  days: z.number().int().min(DORMANT_THRESHOLD_MIN_DAYS).max(DORMANT_THRESHOLD_MAX_DAYS).optional(),
});

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const raw = await req.json().catch(() => null);
  const parsed = CreateDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", issues: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const tenantId = tenantOf(claims);
  const userId = claims.sub;
  const now = new Date();
  const thresholdDays = input.days ?? DORMANT_THRESHOLD_DAYS;

  try {
    // On RE-DÉTECTE côté serveur et on ne garde QUE le candidat demandé : le
    // contenu du brouillon ne vient jamais du client (anti-forge, explicabilité).
    const [leadsRes, mandatesRes, visitsRes, propsRes, critRes] = await Promise.all([
      db
        .from("leads")
        .select("id,full_name,email,phone,kind,status,updated_at,created_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .limit(2000),
      db
        .from("mandates")
        .select("id,reference,kind,status,property_id,asking_price,signed_at,updated_at,created_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .limit(2000),
      db
        .from("visits")
        .select("lead_id,scheduled_at,updated_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .limit(4000),
      db
        .from("properties")
        .select("id,title,city,postal_code,asking_price,property_type,surface,rooms,status")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .limit(2000),
      db
        .from("prosp_criteres_acquereur")
        .select(
          "id,lead_id,nom,telephone,actif,type_bien,budget_min,budget_max,surface_min,surface_max,pieces_min,zones,updated_at,created_at",
        )
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .limit(2000),
    ]);

    for (const r of [leadsRes, mandatesRes, visitsRes, propsRes]) {
      if (r.error && !schemaMissing(r.error)) {
        console.error("reactivation_post_fetch_failed", { tenantId, error: r.error.message });
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    }
    if (critRes.error && !schemaMissing(critRes.error)) {
      console.error("reactivation_post_criteres_failed", { tenantId, error: critRes.error.message });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const candidates = detectDormant({
      leads: (leadsRes.data ?? []) as LeadRow[],
      criteres: (critRes.data ?? []) as CritereRow[],
      mandates: (mandatesRes.data ?? []) as MandateRow[],
      visits: (visitsRes.data ?? []) as VisitRow[],
      messages: [],
      properties: (propsRes.data ?? []) as PropertyRow[],
      thresholdDays,
      now,
    });

    const prospect = candidates.find(
      (c) => c.source_id === input.source_id && c.role === input.role,
    );
    if (!prospect) {
      // Le candidat n'est plus dormant (ou n'existe pas / autre owner) → 404 neutre.
      return NextResponse.json({ error: "prospect_not_dormant" }, { status: 404 });
    }

    const content = buildDraft(prospect, { channel: input.channel });

    // Insert owner-scopé. Le brouillon naît TOUJOURS status='draft' — AUCUN envoi.
    const from = (db as unknown as { from: Gpu1Client["from"] }).from.bind(db);
    const { data, error } = await from("outbox_drafts" as never)
      .insert({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        user_id: userId,
        lead_id: prospect.lead_id ?? null,
        channel: content.channel,
        subject: content.subject,
        body: content.body,
        status: "draft",
      })
      .select("id,lead_id,channel,subject,body,status,created_at,updated_at,sent_at")
      .single();

    if (error) {
      if (isSchemaMissing((error as { code?: string }).code)) {
        // outbox_drafts (0050) non appliquée → UNAVAILABLE honnête.
        return NextResponse.json({ error: "outbox_unavailable" }, { status: 503 });
      }
      console.error("[reactivation] draft create failed:", (error as { message?: string }).message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    return NextResponse.json({ draft: data }, { status: 201 });
  } catch (e) {
    console.error("reactivation_post_block_failed", { tenantId, error: String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
