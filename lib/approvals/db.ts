/**
 * lib/approvals/db.ts — accès data de la BOÎTE D'APPROBATION humaine (HITL).
 *
 * La table `agent_alert_approvals` (migration 0045, statuts étendus par 0049) est
 * DÉPLOYÉE et LIVE sur gpu1 (vérifié via PostgREST : colonnes id, tenant_id,
 * agent_id, actor_user_id, match_id, channel, content_hash, status, approved_by,
 * consumed_at, expires_at, created_at, updated_at, decided_by, decided_at).
 * Elle n'est simplement pas dans les types générés `database.types` : comme
 * `lib/agent-gateway/approval.ts`, on l'atteint via un cast local documenté,
 * jamais exposé hors de ce module. Le reste du client gpu1 reste typé.
 *
 * Ce module ne fait QUE lire les approbations en attente et PERSISTER la décision
 * humaine (pending → approved/rejected) de façon atomique (usage unique, pas de
 * double-décision). Il n'EXÉCUTE JAMAIS l'action approuvée — c'est la gateway qui
 * consomme ('approved' → 'consumed') plus tard. Fail-closed / dégradé honnête : la
 * table est live, mais toute indisponibilité DB (réseau, permissions) fait renvoyer
 * UNAVAILABLE aux lectures et échouer proprement la décision — aucune fausse
 * donnée, aucun faux « envoyé ».
 */
import "server-only";
import type { Gpu1Client } from "@/lib/gpu1";
import type { Database } from "@/lib/gpu1/database.types";

/** Nom réel de la table (migration 0045). */
const APPROVALS_TABLE = "agent_alert_approvals";

/** Colonnes lues pour la boîte d'approbation. */
const LIST_COLUMNS =
  "id, tenant_id, agent_id, actor_user_id, match_id, channel, content_hash, status, expires_at, created_at, decided_by, decided_at";

/** Statuts qu'un humain peut consulter dans la boîte. */
export const VIEWABLE_STATUSES = ["pending", "approved", "rejected"] as const;
export type ViewableStatus = (typeof VIEWABLE_STATUSES)[number];

/** Décision humaine possible. */
export type Decision = "approve" | "reject";

/** Ligne d'approbation exposée au client (jamais le contenu brut, seulement le hash). */
export type ApprovalRow = {
  id: string;
  tenant_id: string;
  agent_id: string;
  actor_user_id: string;
  match_id: string;
  channel: string;
  content_hash: string;
  status: string;
  expires_at: string | null;
  created_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
};

/**
 * Accès non typé à la table 0045/0049 (absente de database.types car NON déployée).
 * Cast local et documenté ; on n'expose jamais ce cast hors de ce module.
 */
type UntypedTable = {
  select: (cols: string, opts?: { count?: "exact"; head?: boolean }) => UntypedTable;
  update: (patch: Record<string, unknown>) => UntypedTable;
  eq: (col: string, val: unknown) => UntypedTable;
  in: (col: string, vals: readonly unknown[]) => UntypedTable;
  order: (col: string, opts: { ascending: boolean }) => UntypedTable;
  limit: (n: number) => UntypedTable;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
  then: (
    onfulfilled: (v: { data: unknown[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>;
};
function approvalsTable(db: Gpu1Client<Database>): UntypedTable {
  return (db as unknown as { from: (t: string) => UntypedTable }).from(APPROVALS_TABLE);
}

export type ListResult =
  | { ok: true; rows: ApprovalRow[] }
  | { ok: false; reason: "unavailable" };

/**
 * Liste bornée les approbations d'un tenant, filtrée sur un statut visible.
 * Owner-check STRICT : `tenant_id` sur chaque requête (le client admin bypass RLS
 * → filtrage explicite obligatoire). Fail-closed : table absente / erreur DB →
 * { ok:false, reason:"unavailable" } (état honnête, jamais de fausse donnée).
 */
export async function listApprovals(
  db: Gpu1Client<Database>,
  tenantId: string,
  status: ViewableStatus,
  limit: number,
): Promise<ListResult> {
  let table: UntypedTable;
  try {
    table = approvalsTable(db);
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  let res: { data: unknown[] | null; error: unknown };
  try {
    res = (await table
      .select(LIST_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(limit)) as { data: unknown[] | null; error: unknown };
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (res.error) return { ok: false, reason: "unavailable" };
  const rows = Array.isArray(res.data) ? res.data.map(coerceRow) : [];
  return { ok: true, rows };
}

export type DecisionResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_decided" | "unavailable" };

/**
 * Persiste la décision humaine sur UNE approbation en attente, de façon atomique
 * (claim conditionnel `status = 'pending'`). Owner-check STRICT : `tenant_id` +
 * `id` sur l'update. USAGE UNIQUE : 0 ligne mise à jour ⇒ déjà décidée / course
 * perdue → { already_decided } (jamais de double-décision).
 *
 * N'EXÉCUTE PAS l'action : approve = passe à 'approved' (la gateway pourra la
 * consommer plus tard) ; reject = passe à 'rejected' (fin de vie). On ne touche
 * jamais à un envoi réel ici.
 */
export async function decideApproval(
  db: Gpu1Client<Database>,
  args: { id: string; tenantId: string; deciderUserId: string; decision: Decision },
): Promise<DecisionResult> {
  const nextStatus = args.decision === "approve" ? "approved" : "rejected";
  const nowIso = new Date().toISOString();

  let table: UntypedTable;
  try {
    table = approvalsTable(db);
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  // Existence + appartenance tenant AVANT le claim (distingue not_found de
  // already_decided pour un message honnête). Owner-check tenant explicite.
  let found: { data: Record<string, unknown> | null; error: unknown };
  try {
    found = await table
      .select("id, status")
      .eq("id", args.id)
      .eq("tenant_id", args.tenantId)
      .maybeSingle();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (found.error) return { ok: false, reason: "unavailable" };
  if (!found.data || typeof found.data.id !== "string") {
    return { ok: false, reason: "not_found" };
  }
  if (found.data.status !== "pending") {
    return { ok: false, reason: "already_decided" };
  }

  // Claim atomique : ne bascule que si TOUJOURS 'pending'. 0 ligne ⇒ course perdue.
  let claimed: { data: Record<string, unknown> | null; error: unknown };
  try {
    claimed = await table
      .update({
        status: nextStatus,
        decided_by: args.deciderUserId,
        decided_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", args.id)
      .eq("tenant_id", args.tenantId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (claimed.error) return { ok: false, reason: "unavailable" };
  if (!claimed.data || typeof claimed.data.id !== "string") {
    return { ok: false, reason: "already_decided" };
  }
  return { ok: true };
}

/** Normalise une ligne brute PostgREST en ApprovalRow (jamais de champ manquant). */
function coerceRow(raw: unknown): ApprovalRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    id: str(r.id),
    tenant_id: str(r.tenant_id),
    agent_id: str(r.agent_id),
    actor_user_id: str(r.actor_user_id),
    match_id: str(r.match_id),
    channel: str(r.channel),
    content_hash: str(r.content_hash),
    status: str(r.status),
    expires_at: strOrNull(r.expires_at),
    created_at: strOrNull(r.created_at),
    decided_by: strOrNull(r.decided_by),
    decided_at: strOrNull(r.decided_at),
  };
}
