/**
 * app/api/assistant-ops/draft/route.ts — matérialise une PROPOSITION en BROUILLON (W9).
 *
 * POST : à partir d'une proposition de l'assistant (leadId + canal), crée un
 * message dans l'outbox en `status='draft'`. C'est la SEULE écriture de la
 * feature — et elle est INOFFENSIVE : un brouillon ne part JAMAIS d'ici. L'envoi
 * réel exige une validation humaine explicite dans l'Outbox (HITL). L'assistant
 * ne fait donc jamais d'action directe : il prépare, l'humain décide.
 *
 * Sécurité (impérative) :
 *   - auth 401 AVANT tout accès DB,
 *   - owner-check `user_id + tenant_id` sur le lead cible ET sur l'insert,
 *   - Zod strict (canal enum, corps borné, ids uuid),
 *   - IDs `crypto.randomUUID()`, erreurs génériques 500,
 *   - table `outbox_drafts` absente (0050 non appliquée) → UNAVAILABLE honnête (503).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin, type Gpu1Client } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import {
  OUTBOX_CHANNELS,
  isSchemaMissing,
  type OutboxChannel,
} from "@/lib/outbox/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Corps borné (anti-abus) : la proposition fournit un texte déjà rédigé côté client. */
const DraftSchema = z.object({
  lead_id: z.string().uuid(),
  channel: z.enum(OUTBOX_CHANNELS as unknown as [OutboxChannel, ...OutboxChannel[]]),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1).max(8000),
});

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const raw = await req.json().catch(() => null);
  const parsed = DraftSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const tenantId = tenantOf(claims);
  const userId = claims.sub;

  // 1) Owner-check STRICT sur le lead cible AVANT toute écriture. Le token admin
  //    bypasse RLS → filtrage explicite user_id + tenant_id obligatoire.
  const { data: lead, error: leadErr } = await db
    .from("leads")
    .select("id")
    .eq("id", input.lead_id)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (leadErr) {
    console.error("[assistant-ops] lead check failed:", (leadErr as { message?: string }).message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  // Anti-énumération : lead inconnu / hors périmètre → 404 neutre.
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 2) Insert owner-scopé. Le draft naît TOUJOURS en 'draft' — aucun envoi.
  const from = (db as unknown as { from: Gpu1Client["from"] }).from.bind(db);
  const { data, error } = await from("outbox_drafts" as never)
    .insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      lead_id: input.lead_id,
      channel: input.channel,
      subject: input.subject ?? null,
      body: input.body,
      status: "draft",
    })
    .select(
      "id,lead_id,channel,subject,body,status,provider,provider_ref,error,created_at,updated_at,sent_at",
    )
    .single();

  if (error) {
    if (isSchemaMissing((error as { code?: string }).code)) {
      return NextResponse.json({ error: "outbox_unavailable" }, { status: 503 });
    }
    console.error("[assistant-ops] draft create failed:", (error as { message?: string }).message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  return NextResponse.json({ draft: data }, { status: 201 });
}
