/**
 * lib/agent-gateway/audit.ts — journal d'audit non contournable (§2 du contrat).
 *
 * Chaque appel gateway (lecture ou écriture) est journalisé : interface,
 * tenant, utilisateur, agent appelant, horodatage, statut de sortie, id de
 * corrélation. Best-effort : une panne d'écriture d'audit ne bloque jamais la
 * réponse à l'agent (même posture que prosp_ingestion_runs / auth_audit_log),
 * mais elle est loggée serveur pour investigation.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { getGpu1Admin } from "@/lib/gpu1";
import type { TruthStatusT } from "./contracts";

export function newRequestId(): string {
  return randomUUID();
}

interface AuditEntry {
  interface: string;
  tenantId: string;
  userId: string | null;
  agentId: string | null;
  requestId: string;
  status: TruthStatusT;
  reason?: string | null;
  durationMs: number;
}

/** UUID valide ? `actor_user_id` peut être "system" (job autonome) → null en DB. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function recordGatewayAudit(entry: AuditEntry): Promise<void> {
  const db = getGpu1Admin();
  if (!db) return;
  try {
    await db.from("agent_gateway_audit_log").insert({
      interface: entry.interface,
      tenant_id: entry.tenantId,
      user_id: entry.userId && UUID_RE.test(entry.userId) ? entry.userId : null,
      agent_id: entry.agentId,
      request_id: entry.requestId,
      status: entry.status,
      reason: entry.reason ?? null,
      duration_ms: entry.durationMs,
    });
  } catch (err) {
    console.error("[agent-gateway] audit_write_failed", {
      interface: entry.interface,
      requestId: entry.requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
