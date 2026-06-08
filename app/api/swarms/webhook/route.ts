// ─── POST /api/swarms/webhook — webhook push HMAC engine→app ─────────────────
//
// Reçoit les événements de runs depuis le moteur MySwarms.
// Sécurisé par HMAC-SHA256 (header x-myswarms-signature-256 ou x-myswarms-signature).
// Aucune logique métier inline : délégué à applyRunWebhook (lib/swarms/webhook.ts).

import { NextResponse, type NextRequest } from "next/server";
import { verifyHmacSignature } from "@/lib/invest/shared/webhooks";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { normalizeRun, applyRunWebhook } from "@/lib/swarms/webhook";
import type { SwarmWebhookPayload } from "@/lib/swarms/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 1. Vérification configuration
  const secret = process.env.MYSWARMS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "myswarms_webhook_not_configured" },
      { status: 503 },
    );
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json(
      { error: "supabase_not_configured" },
      { status: 503 },
    );
  }

  // 2. Lecture du corps brut AVANT tout parse (timing-safe)
  const rawBody = await req.text();

  // 3. Vérification signature HMAC
  const signature =
    req.headers.get("x-myswarms-signature-256") ??
    req.headers.get("x-myswarms-signature") ??
    "";

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // 4. Parse JSON (tolérant : si unparsable, on retourne 200 pour que l'engine
  //    ne retente pas indéfiniment un payload malformé)
  let parsed: SwarmWebhookPayload;
  try {
    parsed = JSON.parse(rawBody) as SwarmWebhookPayload;
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparsable" });
  }

  // 5. Validation minimale : run_id requis
  const runId = typeof parsed.run_id === "string" ? parsed.run_id
    : typeof parsed.id === "string" ? parsed.id
    : null;
  if (!runId) {
    return NextResponse.json({ ok: true, ignored: "no_run_id" });
  }

  // Normaliser via la même fonction que le client (mapRunStatus inclus)
  const payloadWithId: Record<string, unknown> = { ...parsed, run_id: runId };
  const run = normalizeRun(payloadWithId);

  // 6. Application (swarm_run + mission)
  try {
    const out = await applyRunWebhook(sb, run);
    return NextResponse.json({ ok: true, ...out });
  } catch {
    return NextResponse.json({ error: "apply_failed" }, { status: 500 });
  }
}
