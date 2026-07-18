/**
 * /api/outbox — outbox de brouillons (W5).
 *
 *   GET  : liste owner-scopée des drafts du tenant (filtre statut optionnel).
 *   POST : crée un brouillon (status='draft'). AUCUN envoi ici — création seule.
 *
 * Fail-closed : 401 avant tout accès DB, owner-check tenant_id + user_id sur
 * chaque requête, Zod strict, IDs uuid côté DB (gen_random_uuid). Table absente
 * → UNAVAILABLE honnête (jamais de crash). Aucun secret renvoyé.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin, type Gpu1Client } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { listDrafts } from "@/lib/outbox";
import {
  OUTBOX_CHANNELS,
  OUTBOX_STATUSES,
  isSchemaMissing,
  type OutboxChannel,
  type OutboxStatus,
} from "@/lib/outbox/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  channel: z.enum(OUTBOX_CHANNELS as unknown as [OutboxChannel, ...OutboxChannel[]]),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1).max(8000),
  lead_id: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const statusRaw = searchParams.get("status") ?? undefined;
  const status =
    statusRaw && (OUTBOX_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as OutboxStatus)
      : undefined;
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

  const res = await listDrafts(db, tenantOf(claims), claims.sub, { status, limit });
  if (!res.ok) {
    if (res.reason === "unavailable") {
      return NextResponse.json({ drafts: [], unavailable: true, reason: "outbox_schema_missing" });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  return NextResponse.json({ drafts: res.drafts });
}

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const raw = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const tenantId = tenantOf(claims);
  const userId = claims.sub;

  // Insert owner-scopé. Le draft naît TOUJOURS en status='draft' — aucun envoi.
  const from = (db as unknown as { from: Gpu1Client["from"] }).from.bind(db);
  const { data, error } = await from("outbox_drafts" as never)
    .insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      lead_id: body.lead_id ?? null,
      channel: body.channel,
      subject: body.subject ?? null,
      body: body.body,
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
    console.error("[outbox] create failed:", (error as { message?: string }).message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  return NextResponse.json({ draft: data }, { status: 201 });
}
