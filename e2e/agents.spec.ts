import { test, expect } from "@playwright/test";
import { loginAdminContext, loginPage } from "./_helpers";

/**
 * `/agents` — ÉTAT UNAVAILABLE HONNÊTE (REA-M04-14, deliverable clé de la RC).
 *
 * Le registre runtime Aigent n'est PAS configuré sur ce serveur
 * (`AIGENT_RUNTIME_BASE_URL` + `AIGENT_RUNTIME_TOKEN` absents). L'app doit le dire
 * honnêtement et NE JAMAIS fabriquer d'agent, de run ni de résultat.
 *
 * Comportement RÉEL vérifié en live sur la RC :
 *   - GET  /api/aigent/agents            (session) → 200 { ok:false, unavailable:{ reason:"not_configured" } }
 *   - POST /api/aigent/agents/:id/runs   (session) → 200 { ok:false, unavailable:{ reason:"not_configured" } }
 *   - sans session                       → 401 { error:"unauthorized" }
 *   - la page /agents rend l'état « Aigent non connecté » + 0 agent + note de frontière.
 *
 * NB de vérité : le brief de mission évoquait « création de run → 404 ». Le 404
 * n'apparaît que si le registre est CONFIGURÉ mais l'agent absent. Ici, rien
 * n'étant configuré, le contrat renvoie `unavailable:not_configured` (état plus
 * honnête encore). Cette spec asserte le comportement RÉEL de la RC.
 */

test.describe("API proxy Aigent — honnêteté du contrat", () => {
  test("GET /api/aigent/agents sans session → 401", async ({ request }) => {
    const res = await request.get("/api/aigent/agents");
    expect(res.status()).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });

  test("GET /api/aigent/agents avec session → unavailable, jamais de faux agent", async () => {
    const api = await loginAdminContext();
    test.skip(!api, "identifiants admin absents");
    try {
      const res = await api!.get("/api/aigent/agents");
      expect(res.status()).toBe(200);
      const body = await res.json();
      // Contrat honnête : soit unavailable, soit liste vide — JAMAIS un agent inventé.
      if ("ok" in body && body.ok === true) {
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBe(0); // registre vide sur la RC
      } else {
        expect(body).toMatchObject({ ok: false, unavailable: { reason: "not_configured" } });
      }
    } finally {
      await api!.dispose();
    }
  });

  test("POST create run avec session → unavailable, jamais de faux run", async () => {
    const api = await loginAdminContext();
    test.skip(!api, "identifiants admin absents");
    try {
      const res = await api!.post("/api/aigent/agents/quelconque-agent/runs", {
        data: { input: {} },
      });
      // Jamais 2xx avec un run factice. Honnête = unavailable (non configuré),
      // ou notFound si un jour configuré-mais-agent-absent.
      const body = await res.json();
      expect(body).not.toHaveProperty("run"); // aucun run fabriqué
      if (res.status() === 200) {
        expect(body).toMatchObject({ ok: false });
        expect(body).toHaveProperty("unavailable");
      } else {
        // Alternative honnête acceptable : 404 (agent inconnu) / 401 / 503.
        expect([401, 404, 503]).toContain(res.status());
      }
    } finally {
      await api!.dispose();
    }
  });

  test("GET /api/aigent/runs/:id/events sans session → 401", async ({ request }) => {
    const res = await request.get("/api/aigent/runs/00000000-0000-0000-0000-000000000000/events");
    expect(res.status()).toBe(401);
  });
});

test.describe("Page /agents — rend l'UNAVAILABLE honnête", () => {
  test("affiche « Aigent non connecté », 0 agent, note de frontière", async ({ page }) => {
    const ok = await loginPage(page);
    test.skip(!ok, "identifiants admin absents");

    await page.goto("/agents");

    // Titre de page + kicker Aigent.
    await expect(page.getByRole("heading", { name: "Agents", level: 1 })).toBeVisible();

    // Statut honnête : « Non connecté » + raison explicite.
    await expect(page.getByText("Non connecté").first()).toBeVisible();
    await expect(page.getByText("Aigent non connecté")).toBeVisible();
    await expect(
      page.getByText("Aucune configuration Aigent détectée sur ce serveur", { exact: false }),
    ).toBeVisible();

    // Frontière affichée : cette page N'EST PAS un constructeur d'agents.
    await expect(page.getByText("Cockpit d'exploitation")).toBeVisible();
    await expect(
      page.getByText("La conception, le prompt, le graphe, le déploiement", { exact: false }),
    ).toBeVisible();

    // ZÉRO faux agent / faux run affiché. Les KPI (Publiés/Exécutables) ne
    // s'affichent QUE si connecté → ici ils sont absents.
    await expect(page.getByText("Publiés", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Exécutions", { exact: true })).toHaveCount(0);
  });

  test("bouton « Actualiser » présent et re-vérifie l'état sans inventer", async ({ page }) => {
    const ok = await loginPage(page);
    test.skip(!ok, "identifiants admin absents");

    await page.goto("/agents");
    const refresh = page.getByRole("button", { name: /Actualiser/i });
    await expect(refresh).toBeVisible();
    await refresh.click();
    // Après refresh, l'état honnête doit persister (toujours non connecté).
    await expect(page.getByText("Aigent non connecté")).toBeVisible();
  });
});
