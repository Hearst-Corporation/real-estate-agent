/**
 * POST /api/invest/webhooks/kyc — webhook KYC Sumsub (Pattern B).
 *
 * EXEMPTÉ du JWT (proxy.ts : `/api/invest/webhooks`) — sécurisé par HMAC, PAS
 * par session. Suit STRICTEMENT les 3 étapes du Pattern B (lib/invest/shared/
 * webhooks.ts) :
 *   1. vérifier la signature HMAC → 401 si invalide (verifyWebhook de l'adaptateur) ;
 *   2. dédupliquer par (provider, provider_event_id) → 200 no-op si doublon ;
 *   3. persister l'état (maj inv_kyc_cases + kyc_status profil) et TENTER le
 *      claim ONCHAINID en fail-soft.
 *
 * Pas de logique métier lourde inline : le mapping/écriture vit dans
 * applyKycWebhook (service domaine). On lit le corps BRUT (rawBody) pour la
 * vérif de signature — jamais le JSON re-sérialisé.
 *
 * Tenant : un webhook n'a pas de session → on opère sur le tenant par défaut
 * (mono-tenant pilote). Le matching se fait par référence provider de l'applicant.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getKycPort, getIdentityRegistryPort } from "@/lib/invest/adapters";
import { applyKycWebhook, supabaseInvestorStore } from "@/lib/invest/investor";
import { runWithDedup, supabaseWebhookStore } from "@/lib/invest/shared/webhooks";
import { DEFAULT_TENANT_ID } from "@/lib/invest/shared/types";
import { hashBody } from "@/lib/invest/shared/idempotency";
import { recordAudit } from "@/lib/invest/shared/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = "sumsub";

export async function POST(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // Corps BRUT (indispensable pour l'HMAC) + header de signature Sumsub.
  const rawBody = await req.text();
  const signature =
    req.headers.get("x-payload-digest") ?? req.headers.get("x-sumsub-signature") ?? undefined;

  const kyc = getKycPort();
  // Provider non configuré → on ne peut pas vérifier la signature : 503 (et non 200,
  // pour que Sumsub retente une fois la clé posée).
  if (!kyc.isConfigured()) {
    return NextResponse.json({ error: "kyc_not_configured" }, { status: 503 });
  }

  // ── 1. Vérification HMAC (rejet 401 sinon) ──────────────────────────────────
  let valid = false;
  try {
    valid = kyc.verifyWebhook({ rawBody, signature: signature ?? "" });
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // ── 2. Parse + dédup (200 no-op si doublon) ─────────────────────────────────
  let event;
  try {
    event = kyc.parseEvent(rawBody);
  } catch {
    // Signature OK mais corps non parsable : on ACK (200) pour ne pas boucler les
    // retries — un event illisible n'est jamais rejouable utilement.
    return NextResponse.json({ ok: true, ignored: "unparsable" }, { status: 200 });
  }

  // providerEventId fourni par l'adaptateur ; fallback hash du corps si absent.
  const providerEventId = event.providerEventId || hashBody(rawBody);

  // ── 3. Dédup + persistance KYC + claim ONCHAINID — rollback dédup si apply échoue
  try {
    const out = await runWithDedup(
      supabaseWebhookStore(DEFAULT_TENANT_ID),
      PROVIDER,
      providerEventId,
      () => applyKycWebhook(
        supabaseInvestorStore(),
        DEFAULT_TENANT_ID,
        { ...event, rawResultHash: hashBody(rawBody) },
        getIdentityRegistryPort(),
      ),
    );
    if (!out.isNew) return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    const result = out.result;
    // Audit additif best-effort (ne casse jamais l'ACK 200).
    await recordAudit(sb, {
      tenantId: DEFAULT_TENANT_ID,
      action: "kyc.decision",
      actorRole: "service",
      entityType: "inv_kyc_case",
      entityId: result.profileId ?? undefined,
      after: { status: event.status, matched: result.matched, onchainClaimed: result.onchainClaimed },
      metadata: { provider: PROVIDER, providerEventId },
    });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: "apply_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
