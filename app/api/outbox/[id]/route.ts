/**
 * PATCH /api/outbox/[id] — édite un brouillon et/ou l'approuve (draft → approved).
 *
 * Transitions autorisées :
 *   - édition du contenu (subject/body/channel/lead_id) : uniquement tant que
 *     le draft est 'draft' ou 'approved' (jamais un 'sent'/'failed'/'canceled').
 *   - approbation : action='approve' → 'draft' → 'approved' (validation humaine).
 *   - annulation  : action='cancel'  → 'draft'|'approved' → 'canceled'.
 *
 * Fail-closed : 401 avant DB, owner-check tenant_id + user_id, Zod. AUCUN envoi
 * ici (l'envoi réel vit dans POST /[id]/send). Table absente → UNAVAILABLE.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin, type Gpu1Client } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { OUTBOX_CHANNELS, isSchemaMissing, type OutboxChannel } from "@/lib/outbox/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    action: z.enum(["edit", "approve", "cancel"]).default("edit"),
    channel: z.enum(OUTBOX_CHANNELS as unknown as [OutboxChannel, ...OutboxChannel[]]).optional(),
    subject: z.string().trim().max(300).nullable().optional(),
    body: z.string().trim().min(1).max(8000).optional(),
    lead_id: z.string().uuid().nullable().optional(),
  })
  .strict();

const VIEW =
  "id,lead_id,channel,subject,body,status,provider,provider_ref,error,created_at,updated_at,sent_at";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const tenantId = tenantOf(claims);
  const userId = claims.sub;

  const from = ((db as unknown as { from: Gpu1Client["from"] }).from.bind(db)) as (
    n: string,
  ) => ReturnType<Gpu1Client["from"]>;

  // Owner-check : charge le draft du tenant + user avant toute écriture.
  const { data: existingData, error: readErr } = await from("outbox_drafts")
    .select("id,status")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("id", id)
    .limit(1);
  if (readErr) {
    if (isSchemaMissing((readErr as { code?: string }).code)) {
      return NextResponse.json({ error: "outbox_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  const existing = (existingData ?? [])[0] as { id: string; status: string } | undefined;
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const editable = existing.status === "draft" || existing.status === "approved";

  // Construit le patch selon l'action.
  const patch: Record<string, unknown> = {};

  if (input.action === "approve") {
    if (existing.status !== "draft") {
      return NextResponse.json({ error: "invalid_transition" }, { status: 409 });
    }
    patch.status = "approved";
  } else if (input.action === "cancel") {
    if (!editable) {
      return NextResponse.json({ error: "invalid_transition" }, { status: 409 });
    }
    patch.status = "canceled";
  } else {
    // edit
    if (!editable) {
      return NextResponse.json({ error: "not_editable" }, { status: 409 });
    }
    if (input.channel !== undefined) patch.channel = input.channel;
    if (input.subject !== undefined) patch.subject = input.subject;
    if (input.body !== undefined) patch.body = input.body;
    if (input.lead_id !== undefined) patch.lead_id = input.lead_id;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "empty_patch" }, { status: 400 });
    }
  }

  const { data, error } = await from("outbox_drafts")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("id", id)
    .select(VIEW)
    .single();

  if (error) {
    console.error("[outbox] patch failed:", (error as { message?: string }).message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  return NextResponse.json({ draft: data });
}
