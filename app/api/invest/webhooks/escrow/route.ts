/**
 * POST /api/invest/webhooks/escrow — webhook séquestre tiers EMI/notaire (Pattern B, P10).
 *
 * EXEMPTÉ du JWT (proxy.ts : `/api/invest/webhooks`) — sécurisé par HMAC, PAS par
 * session. 3 étapes STRICTES :
 *   1. vérifier la signature HMAC → 401 si invalide (EscrowPort.verifyWebhook) ;
 *   2. parse + dédup par (provider, provider_event_id) → 200 no-op si doublon ;
 *   3. faire avancer la machine (signed→funded) via applyEscrowWebhook (transition
 *      PURE) sur une confirmation de dépôt.
 *
 * L'EscrowPort n'expose pas de parseEvent (le mapping dépend du tiers) : on parse
 * le corps localement vers un EscrowDomainEvent normalisé. Corps BRUT pour l'HMAC.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getEscrowPort } from "@/lib/invest/adapters";
import {
  applyEscrowWebhook,
  supabaseSubscriptionStore,
  type EscrowDomainEvent,
} from "@/lib/invest/subscription";
import { runWithDedup, supabaseWebhookStore } from "@/lib/invest/shared/webhooks";
import { DEFAULT_TENANT_ID } from "@/lib/invest/shared/types";
import { hashBody } from "@/lib/invest/shared/idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = "escrow-emi-notaire";

/** Forme (partielle) tolérante d'un webhook de tiers séquestre. */
interface EscrowWebhookPayload {
  event_id?: string;
  event_type?: string; // ex. "deposit.confirmed"
  type?: string;
  subscription_id?: string;
  subscriptionId?: string;
  bank_reference?: string | null;
  data?: { subscription_id?: string; bank_reference?: string | null };
}

/** Normalise le type d'événement tiers → movementType interne du domaine. */
function normalizeMovementType(t: string | undefined): EscrowDomainEvent["movementType"] {
  switch (t) {
    case "deposit.confirmed":
    case "deposit_confirmed":
      return "deposit_confirmed";
    case "refund.confirmed":
    case "refund_confirmed":
      return "refund_confirmed";
    case "release.confirmed":
    case "release_confirmed":
      return "release_confirmed";
    default:
      return t ?? "unknown";
  }
}

export async function POST(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const rawBody = await req.text();
  const signature =
    req.headers.get("x-escrow-signature-256") ??
    req.headers.get("x-escrow-signature") ??
    undefined;

  const escrow = getEscrowPort();
  if (!escrow.isConfigured()) {
    return NextResponse.json({ error: "escrow_not_configured" }, { status: 503 });
  }

  // ── 1. Vérification HMAC (rejet 401 sinon) ──────────────────────────────────
  let valid = false;
  try {
    valid = escrow.verifyWebhook({ rawBody, signature: signature ?? "" });
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // ── 2. Parse + dédup (200 no-op si doublon) ─────────────────────────────────
  let payload: EscrowWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as EscrowWebhookPayload;
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparsable" }, { status: 200 });
  }

  const subscriptionId =
    payload.subscription_id ?? payload.subscriptionId ?? payload.data?.subscription_id ?? "";
  if (!subscriptionId) {
    return NextResponse.json({ ok: true, ignored: "no_subscription" }, { status: 200 });
  }

  const event: EscrowDomainEvent = {
    subscriptionId,
    movementType: normalizeMovementType(payload.event_type ?? payload.type),
    providerEventId: payload.event_id || hashBody(rawBody),
    bankReference: payload.bank_reference ?? payload.data?.bank_reference ?? null,
  };

  // ── 3. Dédup + avancement machine (signed→funded) — rollback dédup si apply échoue
  try {
    const out = await runWithDedup(
      supabaseWebhookStore(DEFAULT_TENANT_ID),
      PROVIDER,
      event.providerEventId,
      () => applyEscrowWebhook(supabaseSubscriptionStore(), DEFAULT_TENANT_ID, event),
    );
    if (!out.isNew) return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    return NextResponse.json({ ok: true, ...out.result }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: "apply_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
