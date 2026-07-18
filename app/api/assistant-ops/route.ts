/**
 * app/api/assistant-ops/route.ts — ASSISTANT OPÉRATIONNEL (W9).
 *
 * GET : ANALYSE les signaux réels (centre d'actions scoré, conversion, dormants)
 * et renvoie des PROPOSITIONS d'action déterministes + explicables, plus l'état
 * de l'automatisation Aigent (LIVE / CONFIG / UNAVAILABLE). Lecture seule.
 *
 * Vérité (non négociable) :
 *   - Aucune proposition fabriquée : chacune dérive d'un signal réel.
 *   - Chaque proposition est bornée à UNE action sûre (open / draft / approval) —
 *     JAMAIS une mutation directe (le POST /draft ne crée qu'un brouillon HITL).
 *   - Aigent absent → automation `config`, l'analyse locale reste servie ; jamais
 *     un faux run, jamais un faux agent.
 *
 * Sécurité : auth 401 AVANT tout accès DB ; DB absente → 503 ; erreurs génériques.
 * Owner-check `user_id + tenant_id` sur chaque requête (délégué à signals.ts).
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { fetchAssistantSignals } from "@/lib/assistant-ops/signals";
import { deriveLabels } from "@/lib/assistant-ops/derive-labels";
import { buildProposals } from "@/lib/assistant-ops/propose";
import { PROPOSE_LABELS } from "@/lib/assistant-ops/labels";
import { resolveAutomation } from "@/lib/assistant-ops/automation";
import type { AssistantResponse, SignalStatus } from "@/lib/assistant-ops/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // 1) Auth AVANT tout accès DB.
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const uid = claims.sub;
  const tid = tenantOf(claims);
  const now = new Date();

  // 2) Signaux (owner-scopés) + automatisation Aigent en parallèle.
  //    L'automatisation est indépendante : son état n'empêche pas l'analyse locale.
  let signals: Awaited<ReturnType<typeof fetchAssistantSignals>>;
  let automation: Awaited<ReturnType<typeof resolveAutomation>>;
  try {
    [signals, automation] = await Promise.all([
      fetchAssistantSignals(db, uid, tid, now, deriveLabels()),
      resolveAutomation(),
    ]);
  } catch (e) {
    console.error("assistant_ops_failed", { tid, error: String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // 3) Propositions déterministes dérivées des signaux réels.
  const proposals = buildProposals({
    scored: signals.scored,
    conversion: signals.conversion,
    dormant: signals.dormant,
    labels: PROPOSE_LABELS,
  });

  const status = (v: unknown): SignalStatus => (v === null ? "unavailable" : "live");

  const body: AssistantResponse = {
    proposals,
    automation,
    signals: {
      actions: status(signals.scored),
      conversion: status(signals.conversion),
      reactivation: status(signals.dormant),
    },
    total: proposals.length,
    computedAt: now.toISOString(),
  };
  return NextResponse.json(body);
}
