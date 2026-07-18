/**
 * lib/outbox/types.ts — modèle de l'outbox de brouillons (W5).
 *
 * Un draft est un message destiné à un client/prospect. Il ne part QUE sur
 * validation humaine (draft → approved) ET si le canal est réellement
 * configuré (Resend pour email, Twilio pour sms/whatsapp). Sinon il reste
 * 'approved' avec un état CONFIG honnête — JAMAIS marqué 'sent' sans envoi réel.
 */

export const OUTBOX_CHANNELS = ["email", "sms", "whatsapp"] as const;
export type OutboxChannel = (typeof OUTBOX_CHANNELS)[number];

export const OUTBOX_STATUSES = [
  "draft",
  "approved",
  "sent",
  "failed",
  "canceled",
] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export interface OutboxDraft {
  id: string;
  tenant_id: string;
  user_id: string;
  lead_id: string | null;
  channel: OutboxChannel;
  subject: string | null;
  body: string;
  status: OutboxStatus;
  provider: string | null;
  provider_ref: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

/** Vue publique renvoyée aux clients (jamais de secret). */
export type OutboxDraftView = Pick<
  OutboxDraft,
  | "id"
  | "lead_id"
  | "channel"
  | "subject"
  | "body"
  | "status"
  | "provider"
  | "provider_ref"
  | "error"
  | "created_at"
  | "updated_at"
  | "sent_at"
>;

/** Code PostgREST « relation absente » / « colonne absente » → table pas encore migrée. */
export const SCHEMA_MISSING_CODES = ["42P01", "42703"] as const;

export function isSchemaMissing(code: string | undefined | null): boolean {
  return (SCHEMA_MISSING_CODES as readonly string[]).includes(String(code ?? ""));
}
