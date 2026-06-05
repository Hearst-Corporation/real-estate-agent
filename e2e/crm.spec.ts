import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── Credentials ──────────────────────────────────────────────────────────────
function readAdminCreds(): { email: string; password: string } | null {
  const paths = [
    "docs/credentials.local.txt",
    "/Users/adrienbeyondcrypto/Dev/Projects/Real estate Agent/docs/credentials.local.txt",
  ];
  for (const p of paths) {
    try {
      const raw = readFileSync(p, "utf8");
      const email = raw.match(/^ADMIN_EMAIL=(.+)$/m)?.[1]?.trim();
      const password = raw.match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim();
      if (email && password) return { email, password };
    } catch {
      /* next */
    }
  }
  return null;
}

// ── Env parser (même logique que seed-crm.mjs) ──────────────────────────────
function loadEnv(): Record<string, string> {
  const paths = [
    ".env.local",
    "/Users/adrienbeyondcrypto/Dev/Projects/Real estate Agent/.env.local",
  ];
  for (const p of paths) {
    try {
      const raw = readFileSync(p, "utf8");
      const env: Record<string, string> = {};
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        // Strip surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
      return env;
    } catch {
      /* next */
    }
  }
  return {};
}

const creds = readAdminCreds();
const envVars = loadEnv();

// ── Shared API context (cookie jar partagé) ───────────────────────────────────
let api: APIRequestContext;

// ── Cleanup tracking (C2) ─────────────────────────────────────────────────────
const createdPropertyIds: string[] = [];
const createdLeadIds: string[] = [];
const createdVisitIds: string[] = [];
const createdMandateIds: string[] = [];

// ── beforeAll : login une seule fois sur le contexte partagé ──────────────────
test.beforeAll(async () => {
  test.skip(!creds, "docs/credentials.local.txt absent — tests CRM ignorés");

  api = await playwrightRequest.newContext({ baseURL: "http://localhost:3002" });
  const res = await api.post("/api/auth/login", {
    data: { email: creds!.email, password: creds!.password },
  });
  expect(res.status()).toBe(200); // cookie stocké dans le jar de `api`
});

// ── afterAll : cleanup rows [E2E] via service role ───────────────────────────
test.afterAll(async () => {
  // dispose the API context
  if (api) await api.dispose();

  // Cleanup via Supabase service role
  const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  try {
    const sb = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Ordre inverse des FK : mandates et visits d'abord, puis leads, puis properties
    if (createdMandateIds.length > 0) {
      await sb.from("mandates").delete().in("id", createdMandateIds);
    }
    if (createdVisitIds.length > 0) {
      await sb.from("visits").delete().in("id", createdVisitIds);
    }
    if (createdLeadIds.length > 0) {
      await sb.from("leads").delete().in("id", createdLeadIds);
    }
    if (createdPropertyIds.length > 0) {
      await sb.from("properties").delete().in("id", createdPropertyIds);
    }
  } catch {
    // best-effort — ne fait pas échouer la suite si cleanup partiel
  }
});

// ── Properties ───────────────────────────────────────────────────────────────
test("POST /api/properties → 201 + id renvoyé", async () => {
  test.skip(!creds, "pas de credentials");
  const res = await api.post("/api/properties", {
    data: {
      title: "[E2E] Test Property",
      property_type: "appartement",
      address: "1 rue de la Paix",
      city: "Paris",
      postal_code: "75001",
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body).toHaveProperty("id");
  createdPropertyIds.push(body.id);
});

test("GET /api/properties → 200 + liste non vide", async () => {
  test.skip(!creds, "pas de credentials");
  const res = await api.get("/api/properties");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.items)).toBe(true);
});

test("POST /api/properties puis GET → id présent dans la liste", async () => {
  test.skip(!creds, "pas de credentials");
  const postRes = await api.post("/api/properties", {
    data: {
      title: "[E2E] Prop CheckPresence",
      property_type: "maison",
      address: "99 avenue Test",
      city: "Lyon",
      postal_code: "69001",
    },
  });
  expect(postRes.status()).toBe(201);
  const { id } = await postRes.json();
  createdPropertyIds.push(id);

  const getRes = await api.get("/api/properties");
  expect(getRes.status()).toBe(200);
  const list = (await getRes.json()).items as { id: string }[];
  const ids = list.map((p) => p.id);
  expect(ids).toContain(id);
});

// ── Leads ─────────────────────────────────────────────────────────────────────
test("POST /api/leads → 201 + id renvoyé", async () => {
  test.skip(!creds, "pas de credentials");
  const res = await api.post("/api/leads", {
    data: { full_name: "[E2E] Lead Test" },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body).toHaveProperty("id");
  createdLeadIds.push(body.id);
});

test("GET /api/leads → 200 + liste non vide", async () => {
  test.skip(!creds, "pas de credentials");
  const res = await api.get("/api/leads");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.items)).toBe(true);
});

test("POST /api/leads puis GET → id présent dans la liste", async () => {
  test.skip(!creds, "pas de credentials");
  const postRes = await api.post("/api/leads", {
    data: {
      full_name: "[E2E] Lead CheckPresence",
      kind: "acheteur",
      type_personne: "particulier",
      email: "e2e.check.lead@example.com",
    },
  });
  expect(postRes.status()).toBe(201);
  const { id } = await postRes.json();
  createdLeadIds.push(id);

  const getRes = await api.get("/api/leads");
  expect(getRes.status()).toBe(200);
  const list = (await getRes.json()).items as { id: string }[];
  const ids = list.map((l) => l.id);
  expect(ids).toContain(id);
});

// ── Visits ────────────────────────────────────────────────────────────────────
test("POST /api/visits → 201 + id renvoyé", async () => {
  test.skip(!creds, "pas de credentials");

  // Crée d'abord une property pour la FK
  const propRes = await api.post("/api/properties", {
    data: {
      title: "[E2E] Prop for Visit",
      property_type: "appartement",
      address: "3 rue Gambetta",
      city: "Bordeaux",
      postal_code: "33000",
    },
  });
  expect(propRes.status()).toBe(201);
  const { id: property_id } = await propRes.json();
  createdPropertyIds.push(property_id);

  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + 2);

  const res = await api.post("/api/visits", {
    data: {
      property_id,
      scheduled_at: scheduledAt.toISOString(),
      duration_min: 30,
      notes: "[E2E] visit test",
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body).toHaveProperty("id");
  createdVisitIds.push(body.id);
});

test("GET /api/visits → 200 + liste non vide", async () => {
  test.skip(!creds, "pas de credentials");
  const res = await api.get("/api/visits");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.items)).toBe(true);
});

test("POST /api/visits puis GET → id présent dans la liste", async () => {
  test.skip(!creds, "pas de credentials");

  const propRes = await api.post("/api/properties", {
    data: {
      title: "[E2E] Prop for Visit Presence",
      property_type: "studio",
      address: "5 rue Lamartine",
      city: "Marseille",
      postal_code: "13001",
    },
  });
  expect(propRes.status()).toBe(201);
  const { id: property_id } = await propRes.json();
  createdPropertyIds.push(property_id);

  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + 4);

  const postRes = await api.post("/api/visits", {
    data: { property_id, scheduled_at: scheduledAt.toISOString() },
  });
  expect(postRes.status()).toBe(201);
  const { id } = await postRes.json();
  createdVisitIds.push(id);

  const getRes = await api.get("/api/visits");
  expect(getRes.status()).toBe(200);
  const list = (await getRes.json()).items as { id: string }[];
  const ids = list.map((v) => v.id);
  expect(ids).toContain(id);
});

// ── Mandates ──────────────────────────────────────────────────────────────────
test("POST /api/mandates → 201 + id renvoyé", async () => {
  test.skip(!creds, "pas de credentials");

  const propRes = await api.post("/api/properties", {
    data: {
      title: "[E2E] Prop for Mandate",
      property_type: "maison",
      address: "12 chemin des Fleurs",
      city: "Nice",
      postal_code: "06000",
    },
  });
  expect(propRes.status()).toBe(201);
  const { id: property_id } = await propRes.json();
  createdPropertyIds.push(property_id);

  const res = await api.post("/api/mandates", {
    data: {
      property_id,
      kind: "exclusif",
      asking_price: 850000,
      commission_pct: 3.5,
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body).toHaveProperty("id");
  createdMandateIds.push(body.id);
});

test("GET /api/mandates → 200 + liste non vide", async () => {
  test.skip(!creds, "pas de credentials");
  const res = await api.get("/api/mandates");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.items)).toBe(true);
});

test("POST /api/mandates puis GET → id présent dans la liste", async () => {
  test.skip(!creds, "pas de credentials");

  const propRes = await api.post("/api/properties", {
    data: {
      title: "[E2E] Prop for Mandate Presence",
      property_type: "appartement",
      address: "8 boulevard Voltaire",
      city: "Toulouse",
      postal_code: "31000",
    },
  });
  expect(propRes.status()).toBe(201);
  const { id: property_id } = await propRes.json();
  createdPropertyIds.push(property_id);

  const postRes = await api.post("/api/mandates", {
    data: { property_id, kind: "simple", asking_price: 320000 },
  });
  expect(postRes.status()).toBe(201);
  const { id } = await postRes.json();
  createdMandateIds.push(id);

  const getRes = await api.get("/api/mandates");
  expect(getRes.status()).toBe(200);
  const list = (await getRes.json()).items as { id: string }[];
  const ids = list.map((m) => m.id);
  expect(ids).toContain(id);
});

// ── Gardes enrich ─────────────────────────────────────────────────────────────
test("enrich lead particulier avec consent:true → 403 forbidden_particulier", async () => {
  test.skip(!creds, "pas de credentials");

  const postRes = await api.post("/api/leads", {
    data: {
      full_name: "[E2E] Particulier Enrich Guard",
      type_personne: "particulier",
      email: "e2e.particulier.guard@example.com",
    },
  });
  expect(postRes.status()).toBe(201);
  const { id } = await postRes.json();
  createdLeadIds.push(id);

  const enrichRes = await api.post(`/api/leads/${id}/enrich`, {
    data: { consent: true },
  });
  expect(enrichRes.status()).toBe(403);
  const body = await enrichRes.json();
  expect(body).toMatchObject({ error: "forbidden_particulier" });
});

test("enrich lead sans body consent → 400 invalid_body", async () => {
  test.skip(!creds, "pas de credentials");

  const postRes = await api.post("/api/leads", {
    data: {
      full_name: "[E2E] Enrich No Consent Guard",
      type_personne: "professionnel",
      email: "e2e.noconsent.guard@example.com",
    },
  });
  expect(postRes.status()).toBe(201);
  const { id } = await postRes.json();
  createdLeadIds.push(id);

  const enrichRes = await api.post(`/api/leads/${id}/enrich`, {
    data: {},
  });
  expect(enrichRes.status()).toBe(400);
  const body = await enrichRes.json();
  expect(body).toMatchObject({ error: "invalid_body" });
});
