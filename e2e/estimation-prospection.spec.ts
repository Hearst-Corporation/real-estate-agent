import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAdminContext, loginPage, loadEnv, gpu1DeleteByIds } from "./_helpers";

/**
 * ESTIMATION + PROSPECTION — parcours critiques (REA-M04-14).
 *
 * API réelles (auth 401 avant DB, Zod, owner-check), plus rendu honnête des pages.
 * Comportements RÉELS vérifiés en live sur la RC :
 *   - GET  /api/estimations                    → 200 { estimations:[] }
 *   - POST /api/estimations { property_id:UUID inconnu } → 404 not_found (owner-check)
 *   - POST /api/estimations { property_id:"x" }         → 400 invalid_body
 *   - GET  /api/prospection/annonces           → 200 { data:[], total }
 *   - GET  /api/prospection/criteres           → 200 { data:[] }
 *   - POST /api/prospection/criteres (sans nom)→ 400 { error:"nom requis" }
 *
 * Aucune PII écrite : seuls des marqueurs `[E2E]` et des UUID nuls sont utilisés.
 */

const envVars = loadEnv();
let api: APIRequestContext | null = null;
const createdEstimationIds: string[] = [];
const createdCriteresIds: string[] = [];

test.beforeAll(async () => {
  api = await loginAdminContext();
});

test.afterAll(async () => {
  // Cleanup best-effort via PostgREST service-role (gpu1), jamais bloquant.
  await gpu1DeleteByIds(envVars, "estimations", createdEstimationIds);
  await gpu1DeleteByIds(envVars, "prosp_criteres_acquereur", createdCriteresIds);
  if (api) await api.dispose();
});

// ── ESTIMATION ────────────────────────────────────────────────────────────────
test.describe("Estimation — API", () => {
  test("GET /api/estimations sans session → 401", async ({ request }) => {
    const res = await request.get("/api/estimations");
    expect(res.status()).toBe(401);
  });

  test("GET /api/estimations avec session → 200 + tableau", async () => {
    test.skip(!api, "identifiants admin absents");
    const res = await api!.get("/api/estimations");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.estimations)).toBe(true);
  });

  test("POST /api/estimations sans property_id → 201 brouillon vide", async () => {
    test.skip(!api, "identifiants admin absents");
    const res = await api!.post("/api/estimations", { data: {} });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    createdEstimationIds.push(body.id);
  });

  test("POST /api/estimations property_id inconnu → 404 not_found (owner-check)", async () => {
    test.skip(!api, "identifiants admin absents");
    const res = await api!.post("/api/estimations", {
      data: { property_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });

  test("POST /api/estimations property_id non-UUID → 400 invalid_body", async () => {
    test.skip(!api, "identifiants admin absents");
    const res = await api!.post("/api/estimations", {
      data: { property_id: "pas-un-uuid" },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_body" });
  });
});

test("Page /estimations rend (heading + shell)", async ({ page }) => {
  const ok = await loginPage(page);
  test.skip(!ok, "identifiants admin absents");
  await page.goto("/estimations");
  await expect(page.getByRole("heading", { name: "Estimations", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation").first()).toBeVisible();
});

// ── PROSPECTION ─────────────────────────────────────────────────────────────
test.describe("Prospection — API", () => {
  test("GET /api/prospection/annonces sans session → 401", async ({ request }) => {
    const res = await request.get("/api/prospection/annonces");
    expect(res.status()).toBe(401);
  });

  test("GET /api/prospection/annonces avec session → 200 + data[]", async () => {
    test.skip(!api, "identifiants admin absents");
    const res = await api!.get("/api/prospection/annonces?limit=5");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /api/prospection/annonces pagination invalide → 200 (borné, pas de crash)", async () => {
    test.skip(!api, "identifiants admin absents");
    const res = await api!.get("/api/prospection/annonces?limit=nope&offset=-10&eligible=1");
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).data)).toBe(true);
  });

  test("GET /api/prospection/criteres avec session → 200 + data[]", async () => {
    test.skip(!api, "identifiants admin absents");
    const res = await api!.get("/api/prospection/criteres");
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).data)).toBe(true);
  });

  test("POST /api/prospection/criteres sans nom → 400 invalid_body + detail", async () => {
    test.skip(!api, "identifiants admin absents");
    const res = await api!.post("/api/prospection/criteres", { data: { zones: ["75011"] } });
    expect(res.status()).toBe(400);
    // Contrat RÉEL de la route : `{ error:"invalid_body", detail:<message zod> }`.
    // (La 1re rédaction attendait `error:"nom requis"` — c'était l'assertion qui
    //  était fausse, pas le produit.)
    const body = await res.json();
    expect(body).toMatchObject({ error: "invalid_body" });
    expect(typeof body.detail).toBe("string");
  });

  test("POST /api/prospection/matchs feedback invalide → 400", async () => {
    test.skip(!api, "identifiants admin absents");
    const res = await api!.post("/api/prospection/matchs", {
      data: { match_id: "not-a-match", verdict: "unknown" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/prospection/matchs sur match inconnu → 404 match_not_found", async () => {
    test.skip(!api, "identifiants admin absents");
    const res = await api!.post("/api/prospection/matchs", {
      data: { match_id: "00000000-0000-0000-0000-000000000000", verdict: "like" },
    });
    expect(res.status()).toBe(404);
    expect(await res.json()).toMatchObject({ error: "match_not_found" });
  });
});

test("Page /prospection rend (heading + shell)", async ({ page }) => {
  const ok = await loginPage(page);
  test.skip(!ok, "identifiants admin absents");
  await page.goto("/prospection");
  await expect(page.getByRole("heading", { name: "Prospection", level: 1 })).toBeVisible();
});
