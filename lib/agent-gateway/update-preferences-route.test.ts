/**
 * Tests d'intégration bout-en-bout de la route `buyers.update_preferences`
 * (rendue AVAILABLE par A4). Prouve, EN PASSANT PAR LA FRONTIÈRE DE CONFIANCE
 * (defineGatewayRoute → authz), que la capacité :
 *   - applique un DELTA PARTIEL (champs absents non touchés, pas d'écrasement) ;
 *   - respecte l'OWNER-CHECK (critère d'un autre user → DENIED, aucune écriture) ;
 *   - respecte le TENANT-CHECK (tenant du payload ≠ token → DENIED avant handler) ;
 *   - renvoie AVAILABLE via la frontière quand tout est autorisé ;
 *   - reste DENIED sur agent hors allowlist / scope manquant (frontière A2).
 *
 * Auth/DB mockées, déterministe, aucun réseau. Même patron que read-route.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeDb, type Row } from "./test-helpers";

const getAdmin = vi.fn();
vi.mock("@/lib/gpu1", async (importActual) => ({ ...(await importActual<object>()), getGpu1Admin: () => getAdmin() }));

import { POST } from "@/app/api/agent-gateway/v1/buyers/update-preferences/route";

const TOKEN = "gateway-secret-token";
const TENANT = "real-estate-agent";
const AGENT = "agent-alpha";
const ACTOR = "11111111-1111-4111-8111-111111111111";
const OTHER_ACTOR = "22222222-2222-4222-8222-222222222222";
const CRITERE = "66666666-6666-4666-8666-666666666666";

/**
 * Seed : un critère appartenant à ACTOR, avec des valeurs de départ qu'on pourra
 * observer non écrasées après un delta partiel.
 */
function seedDb(over?: { critereUser?: string }): FakeDb {
  const critere: Row = {
    id: CRITERE,
    tenant_id: TENANT,
    user_id: over?.critereUser ?? ACTOR,
    nom: "Recherche Alice",
    lead_id: null,
    type_bien: ["appartement"],
    budget_min: 200000,
    budget_max: 400000,
    surface_min: 40,
    surface_max: null,
    pieces_min: 2,
    pieces_max: null,
    zones: ["06600"],
    terrasse: "indifferent",
    parking: "requis",
    ascenseur: "indifferent",
    jardin: "indifferent",
    piscine: "indifferent",
    dpe_max: "D",
    alerte_email: true,
    alerte_whatsapp: false,
    telephone: "0600000001",
    alerte_frequence: "off",
    urgence: null,
    exclusions: [],
    criteres_secondaires: {},
    actif: true,
  };
  return new FakeDb({
    users: [{ id: ACTOR, tenant_id: TENANT, email: "alice@demo-agent.local" }],
    prosp_criteres_acquereur: [critere],
    agent_gateway_idempotency_keys: [],
    agent_gateway_audit_log: [],
  });
}

function makeReq(body: unknown, withToken = true): Request {
  return new Request("http://x/api/agent-gateway/v1/buyers/update-preferences", {
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
  idempotency_key: "prefs-key-abcdef12",
  buyer_id: CRITERE,
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
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// ── Delta partiel : seuls les champs fournis sont écrits ─────────────────────
describe("buyers.update_preferences — delta partiel (AVAILABLE via frontière)", () => {
  it("met à jour SEULEMENT les champs fournis (budget_max, urgence) sans toucher au reste", async () => {
    const db = seedDb();
    getAdmin.mockReturnValue(db);
    const res = await POST(
      makeReq({ ...baseBody, budget_max: 500000, urgence: "haute" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("AVAILABLE");
    expect(json.buyer_id).toBe(CRITERE);
    expect(json.updated_fields.sort()).toEqual(["budget_max", "urgence"]);

    const row = db.tables.prosp_criteres_acquereur[0];
    // Champs modifiés
    expect(row.budget_max).toBe(500000);
    expect(row.urgence).toBe("haute");
    // Champs NON fournis : inchangés (pas d'écrasement à null / défaut)
    expect(row.budget_min).toBe(200000);
    expect(row.parking).toBe("requis");
    expect(row.dpe_max).toBe("D");
    expect(row.zones).toEqual(["06600"]);
    expect(row.nom).toBe("Recherche Alice");
  });

  it("normalise type_bien string → tableau (règle partagée avec la route produit)", async () => {
    const db = seedDb();
    getAdmin.mockReturnValue(db);
    const res = await POST(makeReq({ ...baseBody, type_bien: "maison" }));
    const json = await res.json();
    expect(json.status).toBe("AVAILABLE");
    expect(db.tables.prosp_criteres_acquereur[0].type_bien).toEqual(["maison"]);
  });

  it("aucun champ de préférence fourni → UNAVAILABLE no_fields, aucune écriture", async () => {
    const db = seedDb();
    getAdmin.mockReturnValue(db);
    const res = await POST(makeReq({ ...baseBody }));
    const json = await res.json();
    expect(json.status).toBe("UNAVAILABLE");
    expect(json.reason).toBe("no_fields");
    // Valeur d'origine intacte.
    expect(db.tables.prosp_criteres_acquereur[0].budget_max).toBe(400000);
  });

  it("bornes croisées invalides (budget_min > budget_max) → 400 invalid_body", async () => {
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(
      makeReq({ ...baseBody, budget_min: 900000, budget_max: 100000 }),
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.reason).toBe("invalid_body");
  });

  it("enum hors CHECK (urgence invalide) → 400 invalid_body", async () => {
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq({ ...baseBody, urgence: "catastrophique" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.reason).toBe("invalid_body");
  });

  it("champ non déclaré → 400 invalid_body (.strict, défense en profondeur)", async () => {
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq({ ...baseBody, budget_max: 500000, evil_field: "x" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.reason).toBe("invalid_body");
  });
});

// ── Owner-check : critère d'un autre user → DENIED, aucune écriture ───────────
describe("buyers.update_preferences — owner-check", () => {
  it("critère appartenant à un AUTRE user (même tenant) → DENIED buyer_not_found, intact", async () => {
    const db = seedDb({ critereUser: OTHER_ACTOR });
    getAdmin.mockReturnValue(db);
    const res = await POST(makeReq({ ...baseBody, budget_max: 999999 }));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.status).toBe("DENIED");
    expect(json.reason).toBe("buyer_not_found");
    // Aucune écriture sur le critère d'autrui.
    expect(db.tables.prosp_criteres_acquereur[0].budget_max).toBe(400000);
  });
});

// ── Tenant-check : la frontière refuse un tenant du payload ≠ token ───────────
describe("buyers.update_preferences — tenant-check (frontière A2)", () => {
  it("tenant du payload ≠ tenant du token → DENIED tenant_mismatch AVANT tout handler", async () => {
    const db = seedDb();
    const fromSpy = vi.spyOn(db, "from");
    getAdmin.mockReturnValue(db);
    const res = await POST(makeReq({ ...baseBody, tenant_id: "tenant-pirate", budget_max: 1 }));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.reason).toBe("tenant_mismatch");
    // Le critère n'est jamais lu ni écrit pour un tenant non autorisé.
    const businessTouches = fromSpy.mock.calls.filter(
      (c) => c[0] === "prosp_criteres_acquereur",
    );
    expect(businessTouches.length).toBe(0);
    expect(db.tables.prosp_criteres_acquereur[0].budget_max).toBe(400000);
  });

  it("agent hors allowlist → DENIED agent_not_allowed (gateway close si allowlist vide)", async () => {
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq({ ...baseBody, agent_id: "agent-pirate", budget_max: 1 }));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.reason).toBe("agent_not_allowed");
  });

  it("scope 'read' seul sur une ÉCRITURE → DENIED scope_denied:write", async () => {
    process.env.AGENT_GATEWAY_SCOPES = "read";
    getAdmin.mockReturnValue(seedDb());
    const res = await POST(makeReq({ ...baseBody, budget_max: 1 }));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.reason).toBe("scope_denied:write");
  });

  it("sans token → DENIED 401 avant tout accès métier", async () => {
    const db = seedDb();
    const fromSpy = vi.spyOn(db, "from");
    getAdmin.mockReturnValue(db);
    const res = await POST(makeReq({ ...baseBody, budget_max: 1 }, false));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.status).toBe("DENIED");
    const businessTouches = fromSpy.mock.calls.filter(
      (c) => c[0] === "prosp_criteres_acquereur",
    );
    expect(businessTouches.length).toBe(0);
  });
});

// ── Idempotence : rejeu de la même clé → un seul effet ───────────────────────
describe("buyers.update_preferences — idempotence (framework gateway)", () => {
  it("2e appel même clé + même payload → réponse mémorisée, pas de seconde écriture", async () => {
    const db = seedDb();
    const updateSpy = vi.spyOn(db, "from");
    getAdmin.mockReturnValue(db);

    const body = { ...baseBody, budget_max: 450000 };
    const res1 = await POST(makeReq(body));
    const json1 = await res1.json();
    expect(json1.status).toBe("AVAILABLE");

    // Compte les écritures sur le critère lors du 1er appel.
    const updatesAfter1 = updateSpy.mock.calls.filter(
      (c) => c[0] === "prosp_criteres_acquereur",
    ).length;

    const res2 = await POST(makeReq(body));
    const json2 = await res2.json();
    expect(json2.status).toBe("AVAILABLE");
    expect(json2.buyer_id).toBe(CRITERE);

    // Le 2e appel ne relit/réécrit PAS le critère (rejeu idempotent mémorisé).
    const updatesAfter2 = updateSpy.mock.calls.filter(
      (c) => c[0] === "prosp_criteres_acquereur",
    ).length;
    expect(updatesAfter2).toBe(updatesAfter1);
  });

  it("même clé, payload DIFFÉRENT → DENIED idempotency_key_conflict", async () => {
    const db = seedDb();
    getAdmin.mockReturnValue(db);
    await POST(makeReq({ ...baseBody, budget_max: 450000 }));
    const res2 = await POST(makeReq({ ...baseBody, budget_max: 460000 }));
    const json2 = await res2.json();
    expect(json2.status).toBe("DENIED");
    expect(json2.reason).toBe("idempotency_key_conflict");
  });
});
