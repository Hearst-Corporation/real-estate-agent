/**
 * POST /api/invest/webhooks/esign — webhook e-signature Yousign (Pattern B, ③).
 *
 * EXEMPTÉ du JWT (proxy.ts : `/api/invest/webhooks`) — sécurisé par HMAC, PAS par
 * session. 3 étapes STRICTES (lib/invest/shared/webhooks.ts) :
 *   1. vérifier la signature HMAC → 401 si invalide ;
 *   2. parse + dédup par (provider, provider_event_id) → 200 no-op si doublon ;
 *   3. faire avancer la machine (reserved→signed) via applyEsignWebhook (transition
 *      PURE). Aucune logique métier lourde inline.
 *
 * Corps BRUT (rawBody) pour l'HMAC. Tenant par défaut (webhook sans session) ; la
 * souscription est retrouvée par l'enveloppe e-sign (esign_envelope_id).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getESignaturePort } from "@/lib/invest/adapters";
import {
  applyEsignWebhook,
  supabaseSubscriptionStore,
} from "@/lib/invest/subscription";
import { runWithDedup, supabaseWebhookStore } from "@/lib/invest/shared/webhooks";
import { DEFAULT_TENANT_ID } from "@/lib/invest/shared/types";
import { hashBody } from "@/lib/invest/shared/idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = "yousign";

export async function POST(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const rawBody = await req.text();
  const signature =
    req.headers.get("x-yousign-signature-256") ??
    req.headers.get("x-yousign-signature") ??
    undefined;

  const esign = getESignaturePort();
  // Provider non configuré → on ne peut pas vérifier la signature : 503 (Yousign
  // retentera une fois la clé posée).
  if (!esign.isConfigured()) {
    return NextResponse.json({ error: "esign_not_configured" }, { status: 503 });
  }

  // ── 1. Vérification HMAC (rejet 401 sinon) ──────────────────────────────────
  let valid = false;
  try {
    valid = esign.verifyWebhook({ rawBody, signature: signature ?? "" });
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // ── 2. Parse + dédup (200 no-op si doublon) ─────────────────────────────────
  let event;
  try {
    event = esign.parseEvent(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparsable" }, { status: 200 });
  }

  const providerEventId = event.providerEventId || hashBody(rawBody);

  // ── 3. Dédup + avancement machine (reserved→signed) — rollback dédup si apply échoue
  try {
    const out = await runWithDedup(
      supabaseWebhookStore(DEFAULT_TENANT_ID),
      PROVIDER,
      providerEventId,
      () => applyEsignWebhook(supabaseSubscriptionStore(), DEFAULT_TENANT_ID, event),
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
