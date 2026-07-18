/**
 * Tests d'intégration de la route alerts.dispatch (durcissement A2).
 *
 * Situé sous lib/ car la config vitest ne ramasse que les tests de lib ; on
 * importe le vrai handler POST de la route via l'alias @/app/…. Exerce toute la
 * chaîne (auth → authz → HITL → envoi) avec auth/DB mockées et providers d'envoi
 * ESPIONNÉS. Preuves couvertes :
 *   (5)  dispatch sans approbation → DENIED, AUCUN envoi (Twilio/Resend jamais appelés).
 *   (8)  opt-out respecté → DENIED, aucun envoi (avec une approbation par ailleurs valide).
 *   (9)  timeout → TIMEOUT (pas de retry silencieux).
 *   (10) AUCUN appel Twilio/Resend émis pendant les tests (spies à 0).
 *   + succès complet : approbation valide + pas d'opt-out → envoi UNE fois + provenance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeDb, type Row } from "./test-helpers";
import { contentHash } from "./approval";

// ── Espions providers d'envoi : AUCUN réseau réel, comptage d'appels (preuve 10) ─
const sendWhatsApp = vi.fn(async () => ({ sid: "SM_fake" }));
const sendEmail = vi.fn(async () => ({ id: "email_fake" }));
vi.mock("@/lib/providers/twilio", () => ({
  sendWhatsApp: (...a: unknown[]) => sendWhatsApp(...(a as [])),
  twilioIsConfigured: () => true,
}));
vi.mock("@/lib/providers/resend-email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...(a as [])),
  resendIsConfigured: () => true,
}));
// rateLimit toujours "autorisé" pour isoler la logique d'approbation (jamais réseau).
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => true) }));

// Client admin mocké.
const getAdmin = vi.fn();
vi.mock("@/lib/server/supabase", () => ({ getSupabaseAdmin: () => getAdmin() }));

import { POST } from "@/app/api/agent-gateway/v1/alerts/dispatch/route";

const TOKEN = "gateway-secret-token";
const TENANT = "real-estate-agent";
const AGENT = "agent-alpha";
const ACTOR = "11111111-1111-4111-8111-111111111111";
const MATCH = "33333333-3333-4333-8333-333333333333";
const ANNONCE = "55555555-5555-4555-8555-555555555555";
const CRITERE = "66666666-6666-4666-8666-666666666666";

// Contenu déterministe attendu (doit égaler formatAlertContent(annonce, score)).
const EXPECTED_CONTENT = "Nouveau match 88/100\nBel appart · 60m² · 3p · 300k€\nAntibes";

function seedDb(over?: { approval?: Row | null; optout?: Row[]; alerteEnvoyee?: boolean }): FakeDb {
  const critere: Row = {
    id: CRITERE,
    tenant_id: TENANT,
    user_id: ACTOR,
    nom: "Recherche Alice",
    lead_id: null,
    alerte_whatsapp: true,
    alerte_email: false,
    telephone: "0600000001",
    actif: true,
    zones: ["06600"],
  };
  const annonce: Row = {
    id: ANNONCE,
    tenant_id: TENANT,
    titre: "Bel appart",
    type_bien: "appartement",
    prix: 300000,
    surface: 60,
    pieces: 3,
    ville: "Antibes",
    code_postal: "06600",
    actif: true,
    demarchage_bloque: false,
  };
  const match: Row = {
    id: MATCH,
    tenant_id: TENANT,
    user_id: ACTOR,
    critere_id: CRITERE,
    annonce_id: ANNONCE,
    score_match: 88,
    alerte_envoyee: over?.alerteEnvoyee ?? false,
    alerte_at: null,
    prosp_annonces: annonce,
    prosp_criteres_acquereur: critere,
  };
  const tables: Record<string, Row[]> = {
    users: [{ id: ACTOR, tenant_id: TENANT, email: "alice@demo-agent.local" }],
    prosp_matchs: [match],
    prosp_annonces: [annonce],
    prosp_criteres_acquereur: [critere],
    prosp_optout: over?.optout ?? [],
    agent_alert_approvals: over && "approval" in over ? (over.approval ? [over.approval] : []) : [],
    agent_gateway_idempotency_keys: [],
    agent_gateway_audit_log: [],
  };
  return new FakeDb(tables);
}

function validApproval(): Row {
  return {
    id: "approval-1",
    tenant_id: TENANT,
    actor_user_id: ACTOR,
    agent_id: AGENT,
    match_id: MATCH,
    channel: "whatsapp",
    content_hash: contentHash("whatsapp", EXPECTED_CONTENT),
    status: "approved",
    consumed_at: null,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

function makeReq(body: unknown, withToken = true): Request {
  return new Request("http://x/api/agent-gateway/v1/alerts/dispatch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withToken ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const baseBody = {
  tenant_id: TENANT,
  actor_user_id: ACTOR,
  agent_id: AGENT,
  idempotency_key: "dispatch-key-abcdef12",
  match_id: MATCH,
};

const ENV_KEYS = [
  "AGENT_GATEWAY_TOKEN",
  "AGENT_GATEWAY_TENANT_ID",
  "AGENT_GATEWAY_PROJECT_KEY",
  "AGENT_GATEWAY_ALLOWED_AGENTS",
  "AGENT_GATEWAY_SCOPES",
] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.AGENT_GATEWAY_TOKEN = TOKEN;
  process.env.AGENT_GATEWAY_TENANT_ID = TENANT;
  process.env.AGENT_GATEWAY_PROJECT_KEY = TENANT;
  process.env.AGENT_GATEWAY_ALLOWED_AGENTS = AGENT;
  process.env.AGENT_GATEWAY_SCOPES = "read,write";
  sendWhatsApp.mockClear();
  sendEmail.mockClear();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// ── (5) + (10) Sans approbation → DENIED, aucun envoi ────────────────────────
describe("alerts.dispatch — sans approbation HITL (preuves 5 & 10)", () => {
  it("aucune approbation persistée → DENIED, Twilio/Resend JAMAIS appelés", async () => {
    getAdmin.mockReturnValue(seedDb({ approval: null }));
    const res = await POST(makeReq(baseBody));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.status).toBe("DENIED");
    expect(json.reason).toBe("approval_required");
    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ── (8) Opt-out respecté ─────────────────────────────────────────────────────
describe("alerts.dispatch — opt-out respecté (preuve 8)", () => {
  it("acquéreur opted-out (téléphone dans prosp_optout) → DENIED, aucun envoi", async () => {
    const { createHash } = await import("node:crypto");
    const phoneHash = createHash("sha256").update("0600000001").digest("hex");
    const db = seedDb({
      approval: validApproval(),
      optout: [{ tenant_id: TENANT, telephone_hash: phoneHash, email_hash: null }],
    });
    getAdmin.mockReturnValue(db);

    const res = await POST(makeReq(baseBody));
    const json = await res.json();
    expect(json.status).toBe("DENIED");
    expect(["optout_phone", "optout_email"]).toContain(json.reason);
    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ── (9) Timeout → TIMEOUT ────────────────────────────────────────────────────
describe("alerts.dispatch — timeout (preuve 9)", () => {
  it("handler dépassant le budget → TIMEOUT, pas de retry, aucun envoi", async () => {
    const hangingMatchQuery = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      is() {
        return this;
      },
      maybeSingle() {
        return new Promise(() => {}); // ne résout jamais
      },
      update() {
        return this;
      },
    };
    const real = seedDb({ approval: validApproval() });
    const composed = {
      from(t: string) {
        if (t === "prosp_matchs") return hangingMatchQuery;
        return real.from(t);
      },
    };
    getAdmin.mockReturnValue(composed);

    vi.useFakeTimers();
    const p = POST(makeReq(baseBody));
    await vi.advanceTimersByTimeAsync(15_001);
    const res = await p;
    vi.useRealTimers();
    const json = await res.json();
    expect(json.status).toBe("TIMEOUT");
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });
});

// ── Succès complet : approbation + pas d'opt-out → envoi UNE fois + provenance ─
describe("alerts.dispatch — chemin approuvé (envoi réel simulé)", () => {
  it("approbation valide + pas d'opt-out → AVAILABLE, WhatsApp 1×, provenance présente", async () => {
    getAdmin.mockReturnValue(seedDb({ approval: validApproval() }));
    const res = await POST(makeReq(baseBody));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe("AVAILABLE");
    expect(json.sent).toBe(true);
    expect(json.channel).toBe("whatsapp");
    expect(json.agent_id).toBe(AGENT);
    expect(json.run_id).toBeTruthy();
    expect(json.dispatched_at).toBeTruthy();
    expect(json.approval_id).toBe("approval-1");
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("2e dispatch même clé (approbation déjà consommée) → rejeu idempotent, un seul envoi", async () => {
    const db = seedDb({ approval: validApproval() });
    getAdmin.mockReturnValue(db);
    await POST(makeReq(baseBody));
    const res2 = await POST(makeReq(baseBody));
    await res2.json();
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
  });
});
