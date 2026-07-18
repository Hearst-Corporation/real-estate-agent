/**
 * lib/agent-gateway/approval.ts — vérification HITL fail-closed des envois sensibles.
 *
 * `alerts.dispatch` est une action IRRÉVERSIBLE (notification réelle). Elle exige
 * une APPROBATION HUMAINE PERSISTÉE (table agent_alert_approvals, migration 0045),
 * liée à (tenant, acteur, agent, match, canal, hash du contenu), à USAGE UNIQUE et
 * expirable. Ce module la CONSOMME atomiquement, fail-closed :
 *
 *   - table 0045 non déployée (gpu1, interdit ici) → lookup échoue → DENIED,
 *     AUCUN envoi. C'est le comportement voulu tant que l'infra n'est pas posée :
 *     `alerts.dispatch` reste UNAVAILABLE/DENIED en pratique.
 *   - preuve absente / expirée / statut ≠ 'approved' / hash de contenu différent
 *     / tenant|agent|acteur ne correspondant plus → DENIED, AUCUN envoi.
 *   - AUCUNE auto-approbation : la gateway ne CRÉE jamais d'approbation, elle ne
 *     fait que la consommer. La création vient d'un flux humain hors gateway.
 *
 * Consommation à usage unique : update conditionnel status 'approved' → 'consumed'
 * (claim atomique) ; 0 ligne mise à jour ⇒ déjà consommée / course perdue → DENIED.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { Gpu1Client } from "@/lib/gpu1";
import type { Database } from "@/lib/gpu1/database.types";

/** Nom de la table d'approbation (migration 0045, hors types générés A1). */
const APPROVALS_TABLE = "agent_alert_approvals";

/**
 * Accès non typé à la table 0045 (absente de database.types car NON déployée —
 * A1 possède les types). Cast local et documenté ; le reste du client reste typé.
 * On n'expose jamais ce cast hors de ce module.
 */
type UntypedTable = {
  select: (cols: string) => UntypedTable;
  update: (patch: Record<string, unknown>) => UntypedTable;
  eq: (col: string, val: unknown) => UntypedTable;
  is: (col: string, val: null) => UntypedTable;
  gt: (col: string, val: unknown) => UntypedTable;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
};
function approvalsTable(db: Gpu1Client<Database>): UntypedTable {
  return (db as unknown as { from: (t: string) => UntypedTable }).from(APPROVALS_TABLE);
}

export type ApprovalResult =
  | { ok: true; approvalId: string }
  | { ok: false; reason: string };

/** Hash canonique du contenu approuvé (anti-substitution du message). */
export function contentHash(channel: string, content: string): string {
  return createHash("sha256").update(`${channel}\n${content}`).digest("hex");
}

export interface ApprovalContext {
  tenantId: string;
  actorUserId: string;
  agentId: string;
  matchId: string;
  channel: "whatsapp" | "email";
  content: string;
}

/**
 * Consomme (usage unique) une approbation valide pour ce contexte. Fail-closed :
 * tout écart / table absente → { ok:false }. Ne fait AUCUN envoi — l'appelant
 * n'émet que si ok:true. La consommation est atomique (claim conditionnel).
 */
export async function consumeAlertApproval(
  db: Gpu1Client<Database>,
  ctx: ApprovalContext,
): Promise<ApprovalResult> {
  const hash = contentHash(ctx.channel, ctx.content);
  const nowIso = new Date().toISOString();

  let table: UntypedTable;
  try {
    table = approvalsTable(db);
  } catch {
    return { ok: false, reason: "approval_required" };
  }

  // 1. Recherche d'une approbation ACTIVE correspondant EXACTEMENT au contexte,
  //    non expirée. Toute divergence (tenant/agent/acteur/match/canal/hash) exclut
  //    la ligne → introuvable → DENIED.
  let found: { data: Record<string, unknown> | null; error: unknown };
  try {
    found = await table
      .select("id, status, expires_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("actor_user_id", ctx.actorUserId)
      .eq("agent_id", ctx.agentId)
      .eq("match_id", ctx.matchId)
      .eq("channel", ctx.channel)
      .eq("content_hash", hash)
      .eq("status", "approved")
      .gt("expires_at", nowIso)
      .maybeSingle();
  } catch {
    // Table 0045 absente (non déployée) ou erreur DB → fail-closed.
    return { ok: false, reason: "approval_required" };
  }

  if (found.error) return { ok: false, reason: "approval_required" };
  const row = found.data;
  if (!row || typeof row.id !== "string") {
    return { ok: false, reason: "approval_required" };
  }
  const approvalId = row.id;

  // 2. Consommation atomique à usage unique : approved → consumed, conditionné à
  //    status='approved' ET consumed_at IS NULL ET non expirée. 0 ligne ⇒ déjà
  //    consommée / course perdue → DENIED (jamais un second envoi).
  let claimed: { data: Record<string, unknown> | null; error: unknown };
  try {
    claimed = await table
      .update({ status: "consumed", consumed_at: nowIso })
      .eq("id", approvalId)
      .eq("status", "approved")
      .is("consumed_at", null)
      .gt("expires_at", nowIso)
      .select("id")
      .maybeSingle();
  } catch {
    return { ok: false, reason: "approval_claim_failed" };
  }

  if (claimed.error || !claimed.data || typeof claimed.data.id !== "string") {
    return { ok: false, reason: "approval_already_consumed" };
  }

  return { ok: true, approvalId };
}
