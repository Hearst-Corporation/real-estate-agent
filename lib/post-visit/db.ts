/**
 * lib/post-visit/db.ts — persistance de la boucle post-visite (owner-scopée).
 *
 * - `persistSignals` : upsert des signaux prospect dans `post_visit_signals`
 *   (migration 0054, NON appliquée → dégrade UNAVAILABLE).
 * - `createRelances` : matérialise les relances dérivées en `rea_tasks` (tâches)
 *   et/ou brouillons `outbox_drafts` (DRAFT, jamais envoyés). Une table absente
 *   dégrade proprement sans faux « créé ».
 *
 * Sécurité : client service-role (bypass RLS) → owner-check `user_id + tenant_id`
 * explicite sur CHAQUE écriture, IDs `crypto.randomUUID()`.
 */

import "server-only";
import type { Gpu1Client } from "@/lib/gpu1";
import type { DerivedSignals, RelanceProposal } from "./types";
import { isPostVisitTableMissing } from "./types";

export type DbOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unavailable" | "error" };

/** Le client typé ne connaît pas les tables non migrées → cast contrôlé. */
function tbl(sb: Gpu1Client, name: string) {
  return (sb as unknown as { from: (n: string) => ReturnType<Gpu1Client["from"]> }).from(name);
}

export interface PersistSignalsInput {
  visitId: string;
  leadId: string | null;
  userId: string;
  tenantId: string;
  signals: DerivedSignals;
}

/**
 * Upsert des signaux prospect issus du CR (1 ligne par visite). Persisté dans
 * `post_visit_signals` (0054). Dégrade UNAVAILABLE si la table est absente.
 */
export async function persistSignals(
  sb: Gpu1Client,
  input: PersistSignalsInput,
): Promise<DbOutcome<{ signalId: string }>> {
  const signalId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data, error } = await tbl(sb, "post_visit_signals")
    .upsert(
      {
        id: signalId,
        visit_id: input.visitId,
        lead_id: input.leadId,
        tenant_id: input.tenantId,
        user_id: input.userId,
        interest: input.signals.interest,
        outcome: input.signals.outcome,
        objections: input.signals.objections,
        price_discussed: input.signals.price_discussed,
        updated_at: now,
      },
      { onConflict: "visit_id" },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    if (isPostVisitTableMissing(error.code)) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "error" };
  }
  return { ok: true, data: { signalId: (data as { id: string } | null)?.id ?? signalId } };
}

export interface CreateRelancesInput {
  visitId: string;
  leadId: string | null;
  userId: string;
  tenantId: string;
  proposals: RelanceProposal[];
}

export interface CreatedRelances {
  tasksCreated: number;
  draftsCreated: number;
  /** Détail des états par table pour un affichage honnête LIVE/UNAVAILABLE. */
  tasks: "created" | "unavailable" | "error" | "none";
  drafts: "created" | "unavailable" | "error" | "none";
}

/**
 * Matérialise les relances : tasks → `rea_tasks` (kind='relance', status='open'),
 * drafts → `outbox_drafts` (status='draft', HITL). Chaque table est indépendante :
 * l'absence de l'une n'empêche pas l'autre. Rien n'est envoyé.
 */
export async function createRelances(
  sb: Gpu1Client,
  input: CreateRelancesInput,
): Promise<DbOutcome<CreatedRelances>> {
  const now = new Date().toISOString();
  const result: CreatedRelances = {
    tasksCreated: 0,
    draftsCreated: 0,
    tasks: "none",
    drafts: "none",
  };

  const taskProps = input.proposals.filter((p) => p.kind === "task");
  const draftProps = input.proposals.filter((p) => p.kind === "draft");

  // ── rea_tasks ──
  if (taskProps.length > 0) {
    const rows = taskProps.map((p) => ({
      id: crypto.randomUUID(),
      user_id: input.userId,
      tenant_id: input.tenantId,
      entity_type: p.entityType,
      entity_id: p.entityType === "lead" ? input.leadId : input.visitId,
      kind: "relance",
      title: p.title,
      priority: p.priority,
      status: "open",
      notes: p.body,
      created_at: now,
      updated_at: now,
    }));
    const { error } = await tbl(sb, "rea_tasks").insert(rows);
    if (error) {
      result.tasks = isPostVisitTableMissing(error.code) ? "unavailable" : "error";
    } else {
      result.tasks = "created";
      result.tasksCreated = rows.length;
    }
  }

  // ── outbox_drafts (brouillons, jamais envoyés) ──
  if (draftProps.length > 0) {
    const rows = draftProps.map((p) => ({
      id: crypto.randomUUID(),
      tenant_id: input.tenantId,
      user_id: input.userId,
      lead_id: input.leadId,
      channel: "email",
      subject: p.title,
      body: p.body,
      status: "draft",
      created_at: now,
      updated_at: now,
    }));
    const { error } = await tbl(sb, "outbox_drafts").insert(rows);
    if (error) {
      result.drafts = isPostVisitTableMissing(error.code) ? "unavailable" : "error";
    } else {
      result.drafts = "created";
      result.draftsCreated = rows.length;
    }
  }

  return { ok: true, data: result };
}
