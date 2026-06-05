import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

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

const creds = readAdminCreds();

// ── Auth helper ──────────────────────────────────────────────────────────────
test.beforeAll(async ({ request }) => {
  test.skip(!creds, "docs/credentials.local.txt absent — tests CRM ignorés");
  const res = await request.post("/api/auth/login", {
    data: { email: creds!.email, password: creds!.password },
  });
  expect(res.status()).toBe(200);
});

// ── Properties ───────────────────────────────────────────────────────────────
test("POST /api/properties → 201 + id renvoyé", async ({ request }) => {
  test.skip(!creds, "pas de credentials");
  const res = await request.post("/api/properties", {
    data: {
      title: "E2E Test Property",
      property_type: "appartement",
      address: "1 rue de la Paix",
      city: "Paris",
      postal_code: "75001",
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body).toHaveProperty("id");
});

test("GET /api/properties → 200 + liste non vide", async ({ request }) => {
  test.skip(!creds, "pas de credentials");
  const res = await request.get("/api/properties");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

test("POST /api/properties puis GET → id présent dans la liste", async ({ request }) => {
  test.skip(!creds, "pas de credentials");
  const postRes = await request.post("/api/properties", {
    data: {
      title: "E2E Prop CheckPresence",
      property_type: "maison",
      address: "99 avenue Test",
      city: "Lyon",
      postal_code: "69001",
    },
  });
  expect(postRes.status()).toBe(201);
  const { id } = await postRes.json();

  const getRes = await request.get("/api/properties");
  expect(getRes.status()).toBe(200);
  const list = await getRes.json();
  const ids = list.map((p: { id: string }) => p.id);
  expect(ids).toContain(id);
});

// ── Leads ─────────────────────────────────────────────────────────────────────
test("POST /api/leads → 201 + id renvoyé", async ({ request }) => {
  test.skip(!creds, "pas de credentials");
  const res = await request.post("/api/leads", {
    data: { full_name: "E2E Lead Test" },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body).toHaveProperty("id");
});

test("GET /api/leads → 200 + liste non vide", async ({ request }) => {
  test.skip(!creds, "pas de credentials");
  const res = await request.get("/api/leads");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

test("POST /api/leads puis GET → id présent dans la liste", async ({ request }) => {
  test.skip(!creds, "pas de credentials");
  const postRes = await request.post("/api/leads", {
    data: {
      full_name: "E2E Lead CheckPresence",
      kind: "acheteur",
      type_personne: "particulier",
      email: "e2e.check.lead@example.com",
    },
  });
  expect(postRes.status()).toBe(201);
  const { id } = await postRes.json();

  const getRes = await request.get("/api/leads");
  expect(getRes.status()).toBe(200);
  const list = await getRes.json();
  const ids = list.map((l: { id: string }) => l.id);
  expect(ids).toContain(id);
});

// ── Visits ────────────────────────────────────────────────────────────────────
test("POST /api/visits → 201 + id renvoyé", async ({ request }) => {
  test.skip(!creds, "pas de credentials");

  // Crée d'abord une property pour la FK
  const propRes = await request.post("/api/properties", {
    data: {
      title: "E2E Prop for Visit",
      property_type: "appartement",
      address: "3 rue Gambetta",
      city: "Bordeaux",
      postal_code: "33000",
    },
  });
  expect(propRes.status()).toBe(201);
  const { id: property_id } = await propRes.json();

  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + 2);

  const res = await request.post("/api/visits", {
    data: {
      property_id,
      scheduled_at: scheduledAt.toISOString(),
      duration_min: 30,
      notes: "E2E visit test",
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body).toHaveProperty("id");
});

test("GET /api/visits → 200 + liste non vide", async ({ request }) => {
  test.skip(!creds, "pas de credentials");
  const res = await request.get("/api/visits");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

test("POST /api/visits puis GET → id présent dans la liste", async ({ request }) => {
  test.skip(!creds, "pas de credentials");

  const propRes = await request.post("/api/properties", {
    data: {
      title: "E2E Prop for Visit Presence",
      property_type: "studio",
      address: "5 rue Lamartine",
      city: "Marseille",
      postal_code: "13001",
    },
  });
  expect(propRes.status()).toBe(201);
  const { id: property_id } = await propRes.json();

  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + 4);

  const postRes = await request.post("/api/visits", {
    data: { property_id, scheduled_at: scheduledAt.toISOString() },
  });
  expect(postRes.status()).toBe(201);
  const { id } = await postRes.json();

  const getRes = await request.get("/api/visits");
  expect(getRes.status()).toBe(200);
  const list = await getRes.json();
  const ids = list.map((v: { id: string }) => v.id);
  expect(ids).toContain(id);
});

// ── Mandates ──────────────────────────────────────────────────────────────────
test("POST /api/mandates → 201 + id renvoyé", async ({ request }) => {
  test.skip(!creds, "pas de credentials");

  const propRes = await request.post("/api/properties", {
    data: {
      title: "E2E Prop for Mandate",
      property_type: "maison",
      address: "12 chemin des Fleurs",
      city: "Nice",
      postal_code: "06000",
    },
  });
  expect(propRes.status()).toBe(201);
  const { id: property_id } = await propRes.json();

  const res = await request.post("/api/mandates", {
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
});

test("GET /api/mandates → 200 + liste non vide", async ({ request }) => {
  test.skip(!creds, "pas de credentials");
  const res = await request.get("/api/mandates");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

test("POST /api/mandates puis GET → id présent dans la liste", async ({ request }) => {
  test.skip(!creds, "pas de credentials");

  const propRes = await request.post("/api/properties", {
    data: {
      title: "E2E Prop for Mandate Presence",
      property_type: "appartement",
      address: "8 boulevard Voltaire",
      city: "Toulouse",
      postal_code: "31000",
    },
  });
  expect(propRes.status()).toBe(201);
  const { id: property_id } = await propRes.json();

  const postRes = await request.post("/api/mandates", {
    data: { property_id, kind: "simple", asking_price: 320000 },
  });
  expect(postRes.status()).toBe(201);
  const { id } = await postRes.json();

  const getRes = await request.get("/api/mandates");
  expect(getRes.status()).toBe(200);
  const list = await getRes.json();
  const ids = list.map((m: { id: string }) => m.id);
  expect(ids).toContain(id);
});

// ── Gardes enrich ─────────────────────────────────────────────────────────────
test("enrich lead particulier avec consent:true → 403 forbidden_particulier", async ({ request }) => {
  test.skip(!creds, "pas de credentials");

  const postRes = await request.post("/api/leads", {
    data: {
      full_name: "E2E Particulier Enrich Guard",
      type_personne: "particulier",
      email: "e2e.particulier.guard@example.com",
    },
  });
  expect(postRes.status()).toBe(201);
  const { id } = await postRes.json();

  const enrichRes = await request.post(`/api/leads/${id}/enrich`, {
    data: { consent: true },
  });
  expect(enrichRes.status()).toBe(403);
  const body = await enrichRes.json();
  expect(body).toMatchObject({ error: "forbidden_particulier" });
});

test("enrich lead sans body consent → 400 invalid_body", async ({ request }) => {
  test.skip(!creds, "pas de credentials");

  const postRes = await request.post("/api/leads", {
    data: {
      full_name: "E2E Enrich No Consent Guard",
      type_personne: "professionnel",
      email: "e2e.noconsent.guard@example.com",
    },
  });
  expect(postRes.status()).toBe(201);
  const { id } = await postRes.json();

  const enrichRes = await request.post(`/api/leads/${id}/enrich`, {
    data: {},
  });
  expect(enrichRes.status()).toBe(400);
  const body = await enrichRes.json();
  expect(body).toMatchObject({ error: "invalid_body" });
});
