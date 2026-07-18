/**
 * Tests de l'approbation HITL de alerts.dispatch (durcissement A2, fail-closed).
 *
 * Preuves couvertes :
 *   (5) dispatch sans approbation → DENIED, aucun envoi (consumeAlertApproval
 *       introuvable quand la preuve est absente / table 0045 non déployée).
 *   (6) rejeu d'une approbation (usage unique) → DENIED (consommation atomique).
 *   + hash de contenu divergent → DENIED (anti-substitution du message).
 *   + expiration / mauvais tenant/agent → DENIED.
 */
import { describe, it, expect } from "vitest";
import { consumeAlertApproval, contentHash } from "./approval";
import { FakeDb } from "./test-helpers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const TENANT = "real-estate-agent";
const AGENT = "agent-alpha";
const ACTOR = "11111111-1111-4111-8111-111111111111";
const MATCH = "33333333-3333-4333-8333-333333333333";
const CONTENT = "Nouveau match 88/100\nAppart · 60m² · 3p · 300k€\nAntibes";

function ctx() {
  return {
    tenantId: TENANT,
    actorUserId: ACTOR,
    agentId: AGENT,
    matchId: MATCH,
    channel: "whatsapp" as const,
    content: CONTENT,
  };
}

/** Approbation valide (non expirée) telle qu'un flux humain l'aurait persistée. */
function validApprovalRow(over: Record<string, unknown> = {}) {
  return {
    id: "approval-1",
    tenant_id: TENANT,
    actor_user_id: ACTOR,
    agent_id: AGENT,
    match_id: MATCH,
    channel: "whatsapp",
    content_hash: contentHash("whatsapp", CONTENT),
    status: "approved",
    consumed_at: null,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    ...over,
  };
}

// ── (5) Aucune approbation → DENIED, aucun envoi ─────────────────────────────
describe("consumeAlertApproval — fail-closed sans preuve (preuve 5)", () => {
  it("table d'approbation VIDE (0045 non déployée) → DENIED approval_required", async () => {
    const db = new FakeDb({ agent_alert_approvals: [] }) as unknown as SupabaseClient<Database>;
    const res = await consumeAlertApproval(db, ctx());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("approval_required");
  });

  it("aucune ligne correspondant au contexte → DENIED approval_required", async () => {
    // Approbation existe mais pour un AUTRE match → ne correspond pas.
    const db = new FakeDb({
      agent_alert_approvals: [validApprovalRow({ match_id: "44444444-4444-4444-8444-444444444444" })],
    }) as unknown as SupabaseClient<Database>;
    const res = await consumeAlertApproval(db, ctx());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("approval_required");
  });

  it("hash de contenu DIVERGENT (message substitué) → DENIED approval_required", async () => {
    const db = new FakeDb({
      agent_alert_approvals: [validApprovalRow({ content_hash: contentHash("whatsapp", "autre contenu") })],
    }) as unknown as SupabaseClient<Database>;
    const res = await consumeAlertApproval(db, ctx());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("approval_required");
  });

  it("approbation EXPIRÉE → DENIED approval_required", async () => {
    const db = new FakeDb({
      agent_alert_approvals: [validApprovalRow({ expires_at: new Date(Date.now() - 1000).toISOString() })],
    }) as unknown as SupabaseClient<Database>;
    const res = await consumeAlertApproval(db, ctx());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("approval_required");
  });

  it("approbation pour un AUTRE agent → DENIED (jamais transférable)", async () => {
    const db = new FakeDb({
      agent_alert_approvals: [validApprovalRow({ agent_id: "agent-autre" })],
    }) as unknown as SupabaseClient<Database>;
    const res = await consumeAlertApproval(db, ctx());
    expect(res.ok).toBe(false);
  });
});

// ── (6) Approbation valide → consommée UNE FOIS ; rejeu → DENIED ──────────────
describe("consumeAlertApproval — usage unique (preuve 6)", () => {
  it("approbation valide → ok une fois, puis rejeu → DENIED already_consumed", async () => {
    const db = new FakeDb({
      agent_alert_approvals: [validApprovalRow()],
    }) as unknown as SupabaseClient<Database>;

    const first = await consumeAlertApproval(db, ctx());
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.approvalId).toBe("approval-1");

    // La ligne est passée à 'consumed' → un second appel ne trouve plus d'active.
    const replay = await consumeAlertApproval(db, ctx());
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe("approval_required");
  });

  it("consommation pose status='consumed' + consumed_at (traçabilité)", async () => {
    const rows = [validApprovalRow()];
    const db = new FakeDb({ agent_alert_approvals: rows });
    await consumeAlertApproval(db as unknown as SupabaseClient<Database>, ctx());
    expect(rows[0].status).toBe("consumed");
    expect(rows[0].consumed_at).toBeTruthy();
  });
});
