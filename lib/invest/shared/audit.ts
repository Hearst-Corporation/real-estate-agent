/**
 * lib/invest/shared/audit.ts — Helper d'audit transverse (Epic 1.6).
 *
 * Piste d'audit UNIQUE du domaine = `inv_audit_log` (0020), append-only +
 * hash-chaînée. La SEULE voie d'écriture est le RPC SECURITY DEFINER
 * `inv_append_audit_log` (réservé au service-role — 0023). Ce module factorise
 * l'appel (jusqu'ici dupliqué dans closing/distribution) en un helper unique,
 * BEST-EFFORT : l'audit ne doit JAMAIS casser une opération métier (un échec de
 * RPC est avalé + logué en console). C'est le pendant écriture de
 * `verifyHashChain` (lecture/intégrité, lib/invest/ledger).
 *
 * Colonnes RÉELLES ciblées (0020 inv_audit_log + signature du RPC 0020/0023) :
 *   p_tenant_id, p_action, p_actor_user_id, p_actor_role, p_entity_type,
 *   p_entity_id, p_before, p_after, p_metadata, p_ip, p_user_agent, p_request_id.
 *
 * `actor_role` SQL ∈ {user,admin,service,system,operator} (CHECK 0020). On mappe
 * les rôles MÉTIER (compliance/auditor/investor) vers la granularité technique.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types";
import { getSupabaseAdmin } from "../../server/supabase";
import { InvariantViolationError } from "./errors";
import { scrubObject } from "../../providers/scrub";

/** Client service-role (ou null si non configuré). */
export type AuditSupabase = SupabaseClient<Database> | null;

/** Granularité technique de `inv_audit_log.actor_role` (CHECK 0020). */
export type AuditActorRole = "user" | "admin" | "service" | "system" | "operator";

/** Types d'entité audités (préfixe `inv_*`, alignés sur l'usage des routes). */
export type AuditEntityType =
  | "inv_deal"
  | "inv_subscription"
  | "inv_kyc_case"
  | "inv_distribution"
  | "inv_operator"
  | "inv_investor_profile"
  | "inv_secondary_order"
  | "inv_tenant";

/** Entrée d'audit à enregistrer (best-effort). */
export interface AuditInput {
  tenantId: string;
  /** Action stable, ex. `deal.published`, `subscription.created`, `kyc.decision`. */
  action: string;
  /** uid de l'acteur (null = système/job). */
  actorUserId?: string | null;
  /** Rôle de l'acteur : rôle MÉTIER libre (mappé) ou rôle technique direct. */
  actorRole?: string | null;
  entityType?: AuditEntityType;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  /** Id de corrélation technique (header `x-request-id` le cas échéant). */
  requestId?: string | null;
}

/**
 * Mappe un rôle MÉTIER (C4 : investor/operator/compliance/admin/auditor) vers la
 * granularité technique de `inv_audit_log.actor_role`. Tout rôle inconnu retombe
 * sur `service` (écriture back-office). PUR.
 */
export function mapActorRole(role: string | null | undefined): AuditActorRole {
  switch (role) {
    case "admin":
      return "admin";
    case "operator":
      return "operator";
    case "user":
    case "investor":
      return "user";
    case "system":
      return "system";
    // compliance / auditor / service / inconnu → écriture service-role.
    default:
      return "service";
  }
}

/**
 * Enregistre une entrée d'audit (best-effort). NE LÈVE JAMAIS : l'audit ne doit
 * pas casser l'opération métier qu'il trace. Sans client service-role configuré,
 * c'est un no-op silencieux. Un échec du RPC est logué (console.warn) puis avalé.
 *
 * @returns l'id de l'entrée créée, ou `null` si non écrite (no-op / échec).
 */
export async function recordAudit(sb: AuditSupabase, input: AuditInput): Promise<string | null> {
  const db = sb ?? getSupabaseAdmin();
  if (!db) return null;
  // Scrub PII/secrets from structured payloads before writing to audit log.
  const safeBefore = input.before != null
    ? (scrubObject(input.before) as Record<string, unknown>)
    : undefined;
  const safeAfter = input.after != null
    ? (scrubObject(input.after) as Record<string, unknown>)
    : undefined;
  const safeMetadata = input.metadata != null
    ? (scrubObject(input.metadata) as Record<string, unknown>)
    : undefined;
  try {
    const { data, error } = await db.rpc("inv_append_audit_log", {
      p_tenant_id: input.tenantId,
      p_action: input.action,
      p_actor_user_id: input.actorUserId ?? undefined,
      p_actor_role: mapActorRole(input.actorRole),
      p_entity_type: input.entityType ?? undefined,
      p_entity_id: input.entityId ?? undefined,
      p_before: (safeBefore ?? undefined) as never,
      p_after: (safeAfter ?? undefined) as never,
      p_metadata: (safeMetadata ?? undefined) as never,
      p_request_id: input.requestId ?? undefined,
    });
    if (error) {
      console.warn(`[audit] inv_append_audit_log a échoué (best-effort): ${error.message}`);
      return null;
    }
    return (data as unknown as string | null) ?? null;
  } catch (e) {
    console.warn(
      `[audit] inv_append_audit_log a levé (best-effort, avalé): ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/** Contexte minimal d'un acte audité (issu du JWT vérifié côté route). */
export interface AuditCtx {
  tenantId: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  requestId?: string | null;
}

/** Descripteur de l'entité ciblée par `withAudit`. */
export interface AuditEntity {
  type?: AuditEntityType;
  id?: string | null;
}

/**
 * Exécute `fn`, puis enregistre une entrée d'audit du RÉSULTAT (succès OU échec),
 * de manière BEST-EFFORT, et RENVOIE LE RÉSULTAT DE `fn` (ou re-lève son erreur).
 *
 * - Succès → action `<action>` avec `after = { ok:true, ...resultMeta }`.
 * - Échec  → action `<action>.failed` avec `after = { ok:false, error }`, PUIS
 *   l'erreur originale est re-levée (on n'avale jamais l'erreur métier).
 *
 * L'audit lui-même ne peut pas faire échouer l'opération (recordAudit best-effort).
 *
 * @param resultMeta optionnel : extrait sérialisable du résultat à auditer (évite
 *        de logger des objets volumineux/PII). Si absent, on n'ajoute rien.
 */
export async function withAudit<T>(
  sb: AuditSupabase,
  ctx: AuditCtx,
  action: string,
  entity: AuditEntity,
  fn: () => Promise<T>,
  resultMeta?: (result: T) => Record<string, unknown>,
): Promise<T> {
  try {
    const result = await fn();
    await recordAudit(sb, {
      tenantId: ctx.tenantId,
      action,
      actorUserId: ctx.actorUserId,
      actorRole: ctx.actorRole,
      entityType: entity.type,
      entityId: entity.id,
      requestId: ctx.requestId,
      after: { ok: true, ...(resultMeta ? resultMeta(result) : {}) },
    });
    return result;
  } catch (e) {
    await recordAudit(sb, {
      tenantId: ctx.tenantId,
      action: `${action}.failed`,
      actorUserId: ctx.actorUserId,
      actorRole: ctx.actorRole,
      entityType: entity.type,
      entityId: entity.id,
      requestId: ctx.requestId,
      after: { ok: false, error: e instanceof Error ? e.message : String(e) },
    });
    throw e; // jamais d'erreur métier avalée par l'audit.
  }
}

// ─── 4-eyes : helper factorisé (réutilisable) ─────────────────────────────────

/** Approbation 4-eyes (sous-ensemble inv_approvals, colonnes RÉELLES 0021). */
export interface FourEyesApprovalRow {
  action: string;
  status: string;
  approver_1: string | null;
  approver_2: string | null;
}

/** Actions soumises à 4-eyes (CHECK `inv_approvals.action`, 0021). */
export type FourEyesAction =
  | "deal_publish"
  | "deal_close"
  | "transfer_over_threshold"
  | "kiis_publish"
  | "refund_override"
  | "operator_activate";

/**
 * Valide PUREMENT une garde 4-eyes : au moins une approbation `approved` pour
 * `action` avec deux approbateurs NON nuls et DISTINCTS (operator + compliance).
 * Aligné sur `hasValidCloseApproval` (closing) mais générique sur l'action. PUR.
 */
export function hasValidFourEyes(rows: readonly FourEyesApprovalRow[], action: FourEyesAction): boolean {
  return rows.some(
    (a) =>
      a.action === action &&
      a.status === "approved" &&
      !!a.approver_1 &&
      !!a.approver_2 &&
      a.approver_1 !== a.approver_2,
  );
}

/**
 * Garde 4-eyes I/O (service-role) : lit les approbations `action` du sujet et
 * LÈVE `InvariantViolationError` si aucune approbation valide. Réutilisable par
 * toute opération sensible (close/publish/transfert). Filtré `tenant_id` (I9).
 *
 * @throws InvariantViolationError("4EYES", …) si la garde n'est pas satisfaite.
 */
export async function requireFourEyes(
  sb: AuditSupabase,
  ctx: { tenantId: string },
  action: FourEyesAction,
  subject: { type: string; id: string },
): Promise<void> {
  const db = sb ?? getSupabaseAdmin();
  if (!db) throw new InvariantViolationError("4EYES", "service-role indisponible pour la garde 4-eyes");
  const { data, error } = await db
    .from("inv_approvals")
    .select("action, status, approver_1, approver_2")
    .eq("tenant_id", ctx.tenantId)
    .eq("action", action)
    .eq("subject_type", subject.type)
    .eq("subject_id", subject.id);
  if (error) throw error;
  const rows = (data as unknown as FourEyesApprovalRow[]) ?? [];
  if (!hasValidFourEyes(rows, action)) {
    throw new InvariantViolationError(
      "4EYES",
      `approbation ${action} (2 approbateurs distincts) requise sur ${subject.type}:${subject.id}`,
    );
  }
}
