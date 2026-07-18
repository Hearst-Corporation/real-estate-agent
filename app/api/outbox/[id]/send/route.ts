/**
 * POST /api/outbox/[id]/send — envoi RÉEL d'un draft approuvé (W5).
 *
 * VÉRITÉ CRITIQUE : ce handler ne marque JAMAIS 'sent' sans envoi réel prouvé.
 *
 * Ordre (fail-closed) :
 *   1. auth (401 avant DB) + owner-check tenant_id + user_id.
 *   2. le draft doit être 'approved' (validation humaine préalable via PATCH).
 *   3. résolution du destinataire (email/phone via lead_id) — absent → 422.
 *   4. garde d'envoi `attemptSend` (lib/outbox/send) :
 *        - provider non configuré → reste 'approved' + état CONFIG honnête.
 *        - provider dry-run       → reste 'approved' (dégradé), jamais 'sent'.
 *        - exception              → 'failed' + error.
 *        - ref provider réelle    → 'sent' + sent_at (seul cas de 'sent').
 *
 * L'app doit dégrader proprement si la table n'existe pas encore (UNAVAILABLE).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin, type Gpu1Client } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { attemptSend, providerFor } from "@/lib/outbox/send";
import { recipientForChannel } from "@/lib/outbox";
import { isSchemaMissing, type OutboxChannel } from "@/lib/outbox/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEW =
  "id,lead_id,channel,subject,body,status,provider,provider_ref,error,created_at,updated_at,sent_at";

type DraftRow = {
  id: string;
  channel: OutboxChannel;
  subject: string | null;
  body: string;
  status: string;
  lead_id: string | null;
};

export async function POST(
  _req: NextRequest,
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
  const tenantId = tenantOf(claims);
  const userId = claims.sub;
  const from = ((db as unknown as { from: Gpu1Client["from"] }).from.bind(db)) as (
    n: string,
  ) => ReturnType<Gpu1Client["from"]>;

  // ── 1+2. Charge le draft owner-scopé ────────────────────────────────────────
  const { data: rows, error: readErr } = await from("outbox_drafts")
    .select("id,channel,subject,body,status,lead_id")
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
  const draft = ((rows ?? []) as unknown as DraftRow[])[0];
  if (!draft) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (draft.status === "sent") {
    return NextResponse.json({ error: "already_sent" }, { status: 409 });
  }
  if (draft.status !== "approved") {
    // On n'envoie QUE ce qui a été validé humainement (draft → approved d'abord).
    return NextResponse.json({ error: "not_approved" }, { status: 409 });
  }

  // ── 3. Destinataire : résolu depuis le lead (email/phone) ───────────────────
  let recipient: string | null = null;
  if (draft.lead_id) {
    const { data: leadRows } = await from("leads")
      .select("email,phone")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("id", draft.lead_id)
      .limit(1);
    const lead = (leadRows ?? [])[0] as { email?: string | null; phone?: string | null } | undefined;
    recipient = recipientForChannel(draft.channel, lead);
  }
  if (!recipient) {
    return NextResponse.json(
      { error: "no_recipient", channel: draft.channel },
      { status: 422 },
    );
  }

  // ── 4. Garde d'envoi : décide l'issue SANS jamais fabriquer un 'sent' ───────
  const outcome = await attemptSend({
    channel: draft.channel,
    to: recipient,
    subject: draft.subject,
    body: draft.body,
  });

  const provider = providerFor(draft.channel);

  if (outcome.status === "sent") {
    const { data, error } = await from("outbox_drafts")
      .update({
        status: "sent",
        provider,
        provider_ref: outcome.ref,
        sent_at: outcome.sentAt,
        error: null,
      })
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("id", id)
      .select(VIEW)
      .single();
    if (error) return NextResponse.json({ error: "internal_error" }, { status: 500 });
    return NextResponse.json({ draft: data, sent: true });
  }

  if (outcome.status === "failed") {
    const { data } = await from("outbox_drafts")
      .update({ status: "failed", provider, error: outcome.error })
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("id", id)
      .select(VIEW)
      .single();
    return NextResponse.json({ draft: data, sent: false, error: "send_failed" }, { status: 502 });
  }

  // status === "approved" : provider non configuré OU dry-run → CONFIG honnête.
  // On NE marque JAMAIS 'sent'. Le draft reste 'approved', on journalise la raison.
  const { data } = await from("outbox_drafts")
    .update({ status: "approved", provider, error: outcome.reason })
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("id", id)
    .select(VIEW)
    .single();
  return NextResponse.json(
    {
      draft: data,
      sent: false,
      degraded: true,
      reason: outcome.reason,
      info:
        outcome.reason === "provider_not_configured"
          ? `canal ${draft.channel} non configuré — aucun envoi effectué, message à envoyer manuellement`
          : "provider en mode dry-run — aucun envoi effectué",
    },
    { status: 200 },
  );
}
