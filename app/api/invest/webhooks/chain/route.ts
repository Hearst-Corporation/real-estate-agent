/**
 * POST /api/invest/webhooks/chain — webhook indexer chaîne ERC-3643 (Pattern B, §5.2).
 *
 * EXEMPTÉ du JWT (proxy.ts : `/api/invest/webhooks`) — sécurisé par HMAC, PAS par
 * session. 4 étapes STRICTES :
 *   1. vérifier la signature HMAC → 401 si invalide (ChainPort.verifyWebhook) ;
 *   2. parse + dédup par (provider, provider_event_id) → 200 no-op si doublon ;
 *   3. INSÉRER l'event observé dans inv_chain_events (MIROIR, jamais vérité — I1) ;
 *   4. déclencher une passe de réconciliation DEEP↔chaîne (DEEP gagne ; chaîne>DEEP
 *      ⇒ pause). La logique métier vit dans le CORE `reconcile`, jamais inline ici.
 *
 * Corps BRUT pour l'HMAC. Fail-soft : sans secret webhook configuré → 503 (jamais
 * de faux 200). L'unicité DB (tx_hash, log_index) absorbe les doublons d'indexer.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getChainPort } from "@/lib/invest/adapters";
import { reconcile, supabaseTokenizationStore } from "@/lib/invest/tokenization";
import { runWithDedup, supabaseWebhookStore } from "@/lib/invest/shared/webhooks";
import { DEFAULT_TENANT_ID } from "@/lib/invest/shared/types";
import { hashBody } from "@/lib/invest/shared/idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = "chain_indexer";

/** Forme (partielle) tolérante d'un webhook d'indexer ERC-3643. */
interface ChainWebhookPayload {
  event_id?: string;
  event_name?: string; // "Transfer" | "Mint" | "Burn"…
  type?: string;
  deal_id?: string;
  dealId?: string;
  bond_tranche_id?: string;
  contract_address?: string;
  chain?: string;
  chain_id?: number;
  tx_hash?: string;
  txHash?: string;
  log_index?: number;
  block_number?: number;
  from?: string;
  to?: string;
  from_wallet?: string;
  to_wallet?: string;
  units?: number;
  confirmations?: number;
  data?: {
    deal_id?: string;
    tx_hash?: string;
    log_index?: number;
    units?: number;
    from?: string;
    to?: string;
  };
}

export async function POST(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const rawBody = await req.text();
  const signature =
    req.headers.get("x-chain-signature-256") ??
    req.headers.get("x-chain-signature") ??
    req.headers.get("x-signature") ??
    undefined;

  const chain = getChainPort();

  // ── 1. Vérification HMAC (rejet 401 sinon) ──────────────────────────────────
  let valid = false;
  try {
    valid = chain.verifyWebhook({ rawBody, signature: signature ?? "" });
  } catch {
    // Secret webhook non configuré → 503 explicite (jamais un faux 200).
    return NextResponse.json({ error: "chain_webhook_not_configured" }, { status: 503 });
  }
  if (!valid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // ── 2. Parse + dédup (200 no-op si doublon) ─────────────────────────────────
  let payload: ChainWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ChainWebhookPayload;
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparsable" }, { status: 200 });
  }

  const txHash = payload.tx_hash ?? payload.txHash ?? payload.data?.tx_hash ?? "";
  const logIndex = payload.log_index ?? payload.data?.log_index ?? 0;
  const dealId = payload.deal_id ?? payload.dealId ?? payload.data?.deal_id ?? null;
  if (!txHash) {
    return NextResponse.json({ ok: true, ignored: "no_tx_hash" }, { status: 200 });
  }

  const providerEventId = payload.event_id || `${txHash}:${logIndex}`;

  // ── 3+4. Dédup + insert mirror + réconciliation — rollback dédup si insert échoue
  try {
    const out = await runWithDedup(
      supabaseWebhookStore(DEFAULT_TENANT_ID),
      PROVIDER,
      providerEventId,
      async () => {
        const { error: insErr } = await sb.from("inv_chain_events").insert({
          tenant_id: DEFAULT_TENANT_ID,
          deal_id: dealId,
          bond_tranche_id: payload.bond_tranche_id ?? null,
          contract_address: payload.contract_address ?? null,
          chain: payload.chain ?? null,
          chain_id: payload.chain_id ?? null,
          tx_hash: txHash,
          log_index: logIndex,
          block_number: payload.block_number ?? null,
          event_name: payload.event_name ?? payload.type ?? "Unknown",
          from_wallet: payload.from_wallet ?? payload.from ?? payload.data?.from ?? null,
          to_wallet: payload.to_wallet ?? payload.to ?? payload.data?.to ?? null,
          units: payload.units ?? payload.data?.units ?? null,
          payload: JSON.parse(rawBody),
          confirmations: payload.confirmations ?? 0,
        });
        // Doublon d'indexer (tx_hash, log_index) → traité comme no-op, pas une erreur.
        if (insErr && !String(insErr.code).startsWith("23505") && !/duplicate|unique/i.test(insErr.message ?? "")) {
          throw insErr;
        }

        let reconcileOutcome: string | null = null;
        let paused = false;
        if (dealId) {
          try {
            const rec = await reconcile(supabaseTokenizationStore(), dealId, { tenantId: DEFAULT_TENANT_ID });
            reconcileOutcome = rec.outcome;
            paused = rec.pause;
          } catch {
            // Réconciliation best-effort : l'ingestion a réussi.
          }
        }
        return { reconcileOutcome, paused };
      },
    );

    if (!out.isNew) return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    return NextResponse.json({ ok: true, ingested: true, reconcile: out.result.reconcileOutcome, paused: out.result.paused }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: "chain_event_insert_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
