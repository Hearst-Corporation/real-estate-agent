/**
 * lib/assistant-ops/automation.test.ts — HONNÊTETÉ de la frontière Aigent (W9).
 *
 * Invariant non négociable : quand Aigent n'est pas configuré / pas branché /
 * injoignable, l'assistant l'annonce en CONFIG ou UNAVAILABLE — il ne fabrique
 * JAMAIS d'agent, JAMAIS de run, JAMAIS de fausse analyse. L'analyse locale
 * (propositions déterministes) reste servie indépendamment.
 *
 * `fetch` est mocké et l'env contrôlé : AUCUN appel réseau réel vers Aigent.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAutomation } from "@/lib/assistant-ops/automation";

const BASE = "https://aigent.example.test";
const TOKEN = "runtime-test-token";

/** Réponse `Response`-like minimale pour mocker `fetch`. */
function res(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

function configureRuntime(): void {
  process.env.AIGENT_RUNTIME_BASE_URL = BASE;
  process.env.AIGENT_RUNTIME_TOKEN = TOKEN;
}

function unconfigureRuntime(): void {
  delete process.env.AIGENT_RUNTIME_BASE_URL;
  delete process.env.AIGENT_RUNTIME_TOKEN;
}

afterEach(() => {
  vi.restoreAllMocks();
  unconfigureRuntime();
});

describe("resolveAutomation — Aigent NON configuré", () => {
  it("renvoie CONFIG(not_configured) sans émettre la moindre requête réseau", async () => {
    unconfigureRuntime();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const out = await resolveAutomation();

    expect(out).toEqual({ mode: "config", reason: "not_configured" });
    // Vérité : aucun appel réseau tenté quand la config est absente.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ne fabrique JAMAIS d'agent (aucun agentCount en mode config)", async () => {
    unconfigureRuntime();
    const out = await resolveAutomation();
    expect(out.mode).toBe("config");
    expect(out).not.toHaveProperty("agentCount");
  });
});

describe("resolveAutomation — Aigent configuré", () => {
  it("registre VIDE → CONFIG honnête (rien à exécuter), jamais un faux agent", async () => {
    configureRuntime();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(200, { agents: [] }));

    const out = await resolveAutomation();

    expect(out).toEqual({ mode: "config", reason: "not_provisioned" });
  });

  it("agents publiés → LIVE avec le compte RÉEL du registre", async () => {
    configureRuntime();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      res(200, {
        agents: [
          { id: "a1", projectKey: "real-estate-agent", name: "Relance", status: "production" },
          { id: "a2", projectKey: "real-estate-agent", name: "Tri", status: "production" },
        ],
      }),
    );

    const out = await resolveAutomation();

    expect(out).toEqual({ mode: "live", agentCount: 2 });
  });

  it("token refusé (401) → CONFIG(unauthorized), jamais un faux LIVE", async () => {
    configureRuntime();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(401, {}));

    const out = await resolveAutomation();

    expect(out).toEqual({ mode: "config", reason: "unauthorized" });
  });

  it("registre injoignable (transport KO) → CONFIG, jamais un faux run", async () => {
    configureRuntime();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const out = await resolveAutomation();

    expect(out.mode).toBe("config");
  });

  it("404 (registre non matérialisé) → UNAVAILABLE franc", async () => {
    configureRuntime();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(404, {}));

    const out = await resolveAutomation();

    expect(out).toEqual({ mode: "unavailable" });
  });

  it("200 au corps MALFORMÉ → UNAVAILABLE (jamais une liste vide inventée)", async () => {
    configureRuntime();
    // Corps qui ne respecte pas le schéma du contrat.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(200, { agents: [{ nope: true }] }));

    const out = await resolveAutomation();

    expect(out).toEqual({ mode: "unavailable" });
  });
});
