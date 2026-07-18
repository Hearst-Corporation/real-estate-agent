/**
 * Tests de la frontière de confiance gateway (durcissement A2).
 *
 * Preuves couvertes ici :
 *   (1) token absent → DENIED, aucun accès DB (checkGatewayAuth).
 *   (2) token valide mais mauvais scope → DENIED (applyAuthz scope).
 *   (3) payload avec autre tenant → DENIED (applyAuthz tenant_mismatch).
 *   (4) acteur non délégué / inexistant → DENIED (applyAuthz actor_not_in_tenant).
 *   + agent hors allowlist → DENIED ; allowlist vide → gateway close ;
 *     config absente → DENIED ; délégation signée valide → autorisée ;
 *     délégation forgée/expirée → DENIED.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { applyAuthz } from "./authz";
import { checkGatewayAuth } from "./auth";
import { signDelegation } from "./delegation";
import { FakeDb } from "./test-helpers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const TENANT = "real-estate-agent";
const AGENT = "agent-alpha";
const ACTOR = "11111111-1111-4111-8111-111111111111"; // UUID présent dans users
const OTHER_ACTOR = "22222222-2222-4222-8222-222222222222"; // absent de users

function dbWithUser(): SupabaseClient<Database> {
  return new FakeDb({
    users: [{ id: ACTOR, tenant_id: TENANT, email: "a@demo-agent.local" }],
  }) as unknown as SupabaseClient<Database>;
}

// Snapshot / restauration des vars d'env (déterminisme, pas de fuite entre tests).
const ENV_KEYS = [
  "AGENT_GATEWAY_TOKEN",
  "AGENT_GATEWAY_TENANT_ID",
  "AGENT_GATEWAY_PROJECT_KEY",
  "AGENT_GATEWAY_ALLOWED_AGENTS",
  "AGENT_GATEWAY_SCOPES",
  "AGENT_GATEWAY_DELEGATION_SECRET",
] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  // Config "durcie mais ouverte" par défaut : tenant+projet liés, agent allowlisté,
  // scopes read+write accordés. Chaque test resserre ce qu'il veut prouver.
  process.env.AGENT_GATEWAY_TENANT_ID = TENANT;
  process.env.AGENT_GATEWAY_PROJECT_KEY = TENANT;
  process.env.AGENT_GATEWAY_ALLOWED_AGENTS = AGENT;
  process.env.AGENT_GATEWAY_SCOPES = "read,write";
  delete process.env.AGENT_GATEWAY_DELEGATION_SECRET;
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// ── (1) Token absent → DENIED, aucun accès DB ────────────────────────────────
describe("checkGatewayAuth — Bearer fail-closed (preuve 1)", () => {
  it("token absent (pas de header) → DENIED token_missing", () => {
    process.env.AGENT_GATEWAY_TOKEN = "secret-token";
    const req = new Request("http://x/api/agent-gateway/v1/buyers/list", { method: "POST" });
    const res = checkGatewayAuth(req);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("token_missing");
  });

  it("AGENT_GATEWAY_TOKEN non configuré → DENIED not_configured (jamais ouvert)", () => {
    delete process.env.AGENT_GATEWAY_TOKEN;
    const req = new Request("http://x", {
      method: "POST",
      headers: { authorization: "Bearer whatever" },
    });
    const res = checkGatewayAuth(req);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_configured");
  });

  it("token présent mais faux → DENIED token_invalid", () => {
    process.env.AGENT_GATEWAY_TOKEN = "secret-token";
    const req = new Request("http://x", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token" },
    });
    const res = checkGatewayAuth(req);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("token_invalid");
  });

  it("token exact → ok", () => {
    process.env.AGENT_GATEWAY_TOKEN = "secret-token";
    const req = new Request("http://x", {
      method: "POST",
      headers: { authorization: "Bearer secret-token" },
    });
    expect(checkGatewayAuth(req).ok).toBe(true);
  });
});

// ── (3) Autre tenant → DENIED ────────────────────────────────────────────────
describe("applyAuthz — tenant dérivé du token, pas du payload (preuve 3)", () => {
  it("payload.tenant_id ≠ tenant du token → DENIED tenant_mismatch", async () => {
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: "autre-tenant",
      actor_user_id: ACTOR,
      agent_id: AGENT,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("tenant_mismatch");
  });

  it("tenant correct + acteur en base + agent allowlisté + scope → autorisé, tenant dérivé", async () => {
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: TENANT,
      actor_user_id: ACTOR,
      agent_id: AGENT,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.tenantId).toBe(TENANT);
      expect(res.actorUserId).toBe(ACTOR);
      expect(res.agentId).toBe(AGENT);
      expect(res.scope).toBe("read");
    }
  });
});

// ── (2) Mauvais scope → DENIED ───────────────────────────────────────────────
describe("applyAuthz — scope par interface (preuve 2)", () => {
  it("token scope 'read' seul + interface d'écriture → DENIED scope_denied:write", async () => {
    process.env.AGENT_GATEWAY_SCOPES = "read";
    const db = dbWithUser();
    const res = await applyAuthz(db, "crm.create_lead", {
      tenant_id: TENANT,
      actor_user_id: ACTOR,
      agent_id: AGENT,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("scope_denied:write");
  });

  it("token scope 'write' seul + interface de lecture → DENIED scope_denied:read", async () => {
    process.env.AGENT_GATEWAY_SCOPES = "write";
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: TENANT,
      actor_user_id: ACTOR,
      agent_id: AGENT,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("scope_denied:read");
  });

  it("interface inconnue → traitée comme write (fail-closed strict)", async () => {
    process.env.AGENT_GATEWAY_SCOPES = "read";
    const db = dbWithUser();
    const res = await applyAuthz(db, "unknown.interface", {
      tenant_id: TENANT,
      actor_user_id: ACTOR,
      agent_id: AGENT,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("scope_denied:write");
  });
});

// ── (4) Acteur non délégué / inexistant → DENIED ─────────────────────────────
describe("applyAuthz — acteur vérifié en base ou délégué (preuve 4)", () => {
  it("acteur absent de users (pas de délégation) → DENIED actor_not_in_tenant", async () => {
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: TENANT,
      actor_user_id: OTHER_ACTOR,
      agent_id: AGENT,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("actor_not_in_tenant");
  });

  it("acteur 'system' non délégué → DENIED (jamais d'acteur système libre)", async () => {
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: TENANT,
      actor_user_id: "system",
      agent_id: AGENT,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("actor_not_in_tenant");
  });

  it("délégation signée valide → autorisé même sans ligne users", async () => {
    process.env.AGENT_GATEWAY_DELEGATION_SECRET = "delegation-secret-xyz";
    const expires_at = new Date(Date.now() + 60_000).toISOString();
    const signature = signDelegation("delegation-secret-xyz", {
      tenant_id: TENANT,
      agent_id: AGENT,
      actor_user_id: "system",
      expires_at,
    });
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: TENANT,
      actor_user_id: "system",
      agent_id: AGENT,
      delegation: { actor_user_id: "system", tenant_id: TENANT, agent_id: AGENT, expires_at, signature },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.actorUserId).toBe("system");
  });

  it("délégation à signature forgée → DENIED delegation_bad_signature", async () => {
    process.env.AGENT_GATEWAY_DELEGATION_SECRET = "delegation-secret-xyz";
    const expires_at = new Date(Date.now() + 60_000).toISOString();
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: TENANT,
      actor_user_id: "system",
      agent_id: AGENT,
      delegation: {
        actor_user_id: "system",
        tenant_id: TENANT,
        agent_id: AGENT,
        expires_at,
        signature: "f".repeat(64), // forgée
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("delegation_bad_signature");
  });

  it("délégation expirée → DENIED delegation_expired", async () => {
    process.env.AGENT_GATEWAY_DELEGATION_SECRET = "delegation-secret-xyz";
    const expires_at = new Date(Date.now() - 1000).toISOString();
    const signature = signDelegation("delegation-secret-xyz", {
      tenant_id: TENANT,
      agent_id: AGENT,
      actor_user_id: "system",
      expires_at,
    });
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: TENANT,
      actor_user_id: "system",
      agent_id: AGENT,
      delegation: { actor_user_id: "system", tenant_id: TENANT, agent_id: AGENT, expires_at, signature },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("delegation_expired");
  });

  it("délégation sans secret configuré → DENIED delegation_not_configured", async () => {
    delete process.env.AGENT_GATEWAY_DELEGATION_SECRET;
    const expires_at = new Date(Date.now() + 60_000).toISOString();
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: TENANT,
      actor_user_id: "system",
      agent_id: AGENT,
      delegation: { actor_user_id: "system", tenant_id: TENANT, agent_id: AGENT, expires_at, signature: "a".repeat(64) },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("delegation_not_configured");
  });
});

// ── Agent allowlist + config fail-closed ─────────────────────────────────────
describe("applyAuthz — agent allowlist & config fail-closed", () => {
  it("agent absent du payload → DENIED agent_id_required", async () => {
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", { tenant_id: TENANT, actor_user_id: ACTOR });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("agent_id_required");
  });

  it("agent hors allowlist → DENIED agent_not_allowed", async () => {
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: TENANT,
      actor_user_id: ACTOR,
      agent_id: "agent-inconnu",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("agent_not_allowed");
  });

  it("allowlist VIDE (registre Aigent vide) → tout agent refusé → gateway close", async () => {
    process.env.AGENT_GATEWAY_ALLOWED_AGENTS = "";
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: TENANT,
      actor_user_id: ACTOR,
      agent_id: AGENT,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("agent_not_allowed");
  });

  it("tenant non configuré → DENIED gateway_tenant_not_configured", async () => {
    delete process.env.AGENT_GATEWAY_TENANT_ID;
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: TENANT,
      actor_user_id: ACTOR,
      agent_id: AGENT,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("gateway_tenant_not_configured");
  });

  it("scopes non configurés → DENIED (aucun scope accordé)", async () => {
    delete process.env.AGENT_GATEWAY_SCOPES;
    const db = dbWithUser();
    const res = await applyAuthz(db, "buyers.list", {
      tenant_id: TENANT,
      actor_user_id: ACTOR,
      agent_id: AGENT,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("scope_denied:read");
  });
});
