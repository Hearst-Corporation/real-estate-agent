/**
 * lib/outbox/index.ts — helpers DB de l'outbox (owner-scopés).
 *
 * Toute lecture/écriture filtre EXPLICITEMENT tenant_id + user_id : le client
 * PostgREST admin bypass RLS, donc l'owner-check est applicatif et obligatoire.
 * Aucun secret n'est exposé — les vues renvoyées sont réduites (OutboxDraftView).
 */

import type { Gpu1Client, Database } from "@/lib/gpu1";
import { isSchemaMissing, type OutboxChannel, type OutboxDraftView } from "@/lib/outbox/types";

export type OutboxDbLike = Pick<Gpu1Client<Database>, "from">;

const VIEW_COLUMNS =
  "id,lead_id,channel,subject,body,status,provider,provider_ref,error,created_at,updated_at,sent_at";

/** Le client `from()` ne connaît pas outbox_drafts (types désync gpu1) → cast contrôlé. */
function tbl(db: OutboxDbLike) {
  return (db as unknown as {
    from: (name: string) => ReturnType<OutboxDbLike["from"]>;
  }).from("outbox_drafts");
}

export type ListResult =
  | { ok: true; drafts: OutboxDraftView[] }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "error" };

/**
 * Coordonnée destinataire pour un canal, résolue depuis un lead (email/phone).
 * `null` si aucune coordonnée exploitable — l'envoi doit alors rester bloqué.
 */
export function recipientForChannel(
  channel: OutboxChannel,
  lead: { email?: string | null; phone?: string | null } | null | undefined,
): string | null {
  if (!lead) return null;
  if (channel === "email") return lead.email?.trim() || null;
  return lead.phone?.trim() || null;
}

/** Liste owner-scopée des drafts du tenant. Dégrade en UNAVAILABLE si table absente. */
export async function listDrafts(
  db: OutboxDbLike,
  tenantId: string,
  userId: string,
  opts: { status?: string; limit: number } = { limit: 100 },
): Promise<ListResult> {
  let q = tbl(db)
    .select(VIEW_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(opts.limit, 200)));

  if (opts.status) q = q.eq("status", opts.status);

  const { data, error } = await q;
  if (error) {
    if (isSchemaMissing((error as { code?: string }).code)) {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: false, reason: "error" };
  }
  return { ok: true, drafts: (data ?? []) as unknown as OutboxDraftView[] };
}
