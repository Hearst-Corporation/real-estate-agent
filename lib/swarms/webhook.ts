// ─── Swarms — Webhook logique pure + orchestration ───────────────────────────
//
// Ce module est volontairement découplé de la route HTTP pour être testable.
// Seule la route app/api/swarms/webhook/route.ts fait le I/O HTTP.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeRun } from "@/lib/swarms/client";
import { findMissionByRunId, syncMissionFromRun } from "@/lib/missions/service";
import type { SwarmRun, SwarmRunStatus } from "@/lib/swarms/types";
import { TERMINAL_STATUSES } from "@/lib/swarms/constants";

type Db = SupabaseClient<Database>;

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Statuts terminaux : un run dans cet état ne peut pas régresser. */
const TERMINAL: SwarmRunStatus[] = [...TERMINAL_STATUSES];

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Payload brut reçu du moteur MySwarms via webhook.
 * Les champs correspondent au format engine (snake_case, champs optionnels).
 */
export type SwarmWebhookPayload = {
  /** Identifiant run côté moteur (peut aussi être dans `id`). */
  run_id?: string;
  /** run_id alternatif (format engine). */
  id?: string;
  status?: string;
  output?: string;
  result_text?: string;
  steps?: unknown[];
  decision?: unknown;
  tokens?: number;
  cost?: number;
  event_id?: string;
};

// ─── Logique pure ─────────────────────────────────────────────────────────────

/**
 * Détermine si un statut entrant doit être appliqué sur un run existant.
 * PURE — sans I/O. Garde anti-régression out-of-order :
 *   - si le statut courant est terminal (done|failed|error) ET le statut
 *     entrant est non-terminal → false (on ne régresse jamais un terminal).
 *   - sinon → true.
 */
export function shouldApplyStatus(
  current: SwarmRunStatus | string | null,
  incoming: SwarmRunStatus,
): boolean {
  if (!current) return true;
  const currentIsTerminal = TERMINAL.includes(current as SwarmRunStatus);
  const incomingIsTerminal = TERMINAL.includes(incoming);
  if (currentIsTerminal && !incomingIsTerminal) return false;
  return true;
}

// ─── Résultat de l'application d'un webhook ──────────────────────────────────

export type ApplyRunWebhookResult = {
  swarmRun: "updated" | "skipped" | "unknown";
  mission: "synced" | "none";
};

/**
 * Applique un run normalisé (issu du webhook) sur la base de données.
 *
 * 1. Lit la ligne swarm_runs par run_id.
 *    Modèle de confiance : run_id est globalement UNIQUE (contrainte DB) ; le
 *    webhook est authentifié par HMAC (secret partagé moteur) ; l'attribution
 *    correcte du run_id côté moteur fait partie du périmètre de confiance,
 *    comme les webhooks invest. On écrit donc par run_id seul sous service-role.
 * 2. Si elle existe et shouldApplyStatus → update (status, steps, result,
 *    tokens_in/out/cost_usd, decision, updated_at).
 *    Sinon → "skipped". Si absente → "unknown" (mais continue la propagation mission).
 * 3. Cherche la mission associée → si trouvée, appelle syncMissionFromRun
 *    avec { fromWebhook: true } pour éviter le downgrade awaiting_decision→running
 *    sur un event `running` arrivé hors-ordre.
 *
 * Les erreurs DB lèvent une exception → la route les catch → 500 → l'engine retente.
 */
export async function applyRunWebhook(
  sb: Db,
  run: SwarmRun,
): Promise<ApplyRunWebhookResult> {
  // 1. Lecture swarm_runs
  const { data: existing } = await sb
    .from("swarm_runs")
    .select("*")
    .eq("run_id", run.run_id)
    .maybeSingle();

  let swarmRunResult: ApplyRunWebhookResult["swarmRun"];

  if (!existing) {
    swarmRunResult = "unknown";
  } else {
    const currentStatus = existing.status as SwarmRunStatus | null;
    if (shouldApplyStatus(currentStatus, run.status)) {
      type SwarmRunUpdate = Database["public"]["Tables"]["swarm_runs"]["Update"];
      const updatePayload: SwarmRunUpdate = {
        status: run.status,
        updated_at: new Date().toISOString(),
        // FIX P1-3a : persiste decision (null = effacée à la résolution)
        decision: run.decision ?? null,
      };
      if (run.steps !== undefined) {
        updatePayload.steps = JSON.parse(JSON.stringify(run.steps));
      }
      if (run.output !== undefined) {
        updatePayload.result = run.output;
      }
      // FIX P1-3a : persiste tokens/cost quand définis — ne pas écraser si absent
      if (run.tokens_in !== undefined) updatePayload.tokens_in = run.tokens_in;
      if (run.tokens_out !== undefined) updatePayload.tokens_out = run.tokens_out;
      if (run.cost_usd !== undefined) updatePayload.cost_usd = run.cost_usd;

      // FIX P2-2 : throw si l'update DB échoue → la route catch → 500 → retry engine
      const { error } = await sb
        .from("swarm_runs")
        .update(updatePayload)
        .eq("run_id", run.run_id);
      if (error) throw error;
      swarmRunResult = "updated";
    } else {
      swarmRunResult = "skipped";
    }
  }

  // 2. Propagation mission (best-effort même si le run DB était inconnu)
  //    FIX P1-2 : fromWebhook:true pour ne pas purger une décision HITL active
  //    si un event `running` en retard arrive après paused_hitl.
  const mission = await findMissionByRunId(sb, run.run_id);
  let missionResult: ApplyRunWebhookResult["mission"] = "none";
  if (mission) {
    await syncMissionFromRun(sb, mission, run, { fromWebhook: true });
    missionResult = "synced";
  }

  return { swarmRun: swarmRunResult, mission: missionResult };
}

// ─── Ré-export de normalizeRun pour la route webhook ─────────────────────────

export { normalizeRun };
