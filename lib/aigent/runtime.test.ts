/**
 * Contrat runtime Aigent STRICT (MISSION REA-M04-04) — validations factuelles.
 * =================================================================
 *
 * Invariant non négociable : la couche cliente qui consomme le registre runtime
 * externe reste 100 % honnête. Elle propage l'état RÉEL (vide / 404 / indisponible)
 * et ne transforme JAMAIS un 200 malformé en liste vide ni en faux succès.
 *
 * Ces tests pilotent `lib/aigent/runtime.ts` avec un `fetch` mocké + un env
 * contrôlé. AUCUN appel réseau réel vers Aigent (mock/stub uniquement, cf. brief).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRun,
  getAgent,
  getRun,
  getRunEvents,
  isRuntimeConfigured,
  listAgents,
  resumeRun,
  runtimeAvailability,
} from "@/lib/aigent/runtime";

const BASE = "https://aigent.example.test";
const TOKEN = "runtime-test-token";

/** Réponse `Response`-like minimale pour mocker `fetch`. */
function res(
  status: number,
  body: unknown,
  opts: { unparseable?: boolean } = {},
): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (opts.unparseable) throw new SyntaxError("Unexpected token < in JSON");
      return body;
    },
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
  vi.useRealTimers();
  unconfigureRuntime();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. NON CONFIGURÉ → `not_configured`, ZÉRO requête réseau.
// ─────────────────────────────────────────────────────────────────────────────
describe("runtime non configuré", () => {
  beforeEach(unconfigureRuntime);

  it("runtimeAvailability = not_configured sans vars", () => {
    expect(isRuntimeConfigured()).toBe(false);
    expect(runtimeAvailability()).toEqual({ available: false, reason: "not_configured" });
  });

  it("listAgents n'émet AUCUNE requête réseau et renvoie unavailable/not_configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await listAgents();
    expect(fetchSpy).not.toHaveBeenCalled(); // invariant : zéro appel émis
    expect(r).toEqual({ ok: false, unavailable: { available: false, reason: "not_configured" } });
  });

  it("createRun (mutation) n'émet AUCUNE requête réseau non configuré", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await createRun("agent-x", { foo: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    if (!r.ok && "unavailable" in r) {
      expect(r.unavailable.reason).toBe("not_configured");
    } else {
      throw new Error("attendu: unavailable/not_configured");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 200 MALFORMÉ → état `error` (`invalid_response`), JAMAIS liste vide/faux succès.
// ─────────────────────────────────────────────────────────────────────────────
describe("200 malformé → error, jamais liste vide ni faux succès", () => {
  beforeEach(configureRuntime);

  it("listAgents : agent sans `status` (corps malformé) → error, PAS []", async () => {
    // 200, mais un agent auquel il manque le champ requis `status`.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      res(200, { agents: [{ id: "a1", projectKey: "real-estate-agent", name: "X" }] }),
    );
    const r = await listAgents();
    // Le piège historique : `Array.isArray(body?.agents) ? … : []` aurait renvoyé
    // la liste telle quelle (agent invalide). Le contrat strict refuse.
    expect(r).toEqual({ ok: false, error: "invalid_response" });
    // NON : ni succès, ni liste (même vide).
    expect("data" in r).toBe(false);
  });

  it("listAgents : `agents` absent (200 sans le champ) → error, PAS []", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(200, { totally: "wrong" }));
    const r = await listAgents();
    expect(r).toEqual({ ok: false, error: "invalid_response" });
  });

  it("listAgents : registre VIDE `{agents:[]}` → SUCCÈS data:[] (état honnête, pas une erreur)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(200, { agents: [] }));
    const r = await listAgents();
    expect(r).toEqual({ ok: true, data: [] }); // le vide légitime reste un succès
  });

  it("listAgents : agents valides → SUCCÈS avec la donnée réelle", async () => {
    const agent = {
      id: "seller-copilot",
      projectKey: "real-estate-agent",
      name: "Copilote vendeur",
      status: "production",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(200, { agents: [agent] }));
    const r = await listAgents();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([agent]);
  });

  it("getRun : run sans `status` (200 malformé) → error, JAMAIS un run factice {}", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      res(200, { run: { id: "r1", projectKey: "real-estate-agent", agentId: "a1" } }),
    );
    const r = await getRun("r1");
    // Le piège historique : `extractRun` renvoyait `{}` → un run « fonctionnel »
    // vide. Interdit : un run sans statut n'est pas un run.
    expect(r).toEqual({ ok: false, error: "invalid_response" });
  });

  it("getRun : `status` hors enum → error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      res(200, {
        run: { id: "r1", projectKey: "real-estate-agent", agentId: "a1", status: "exploded" },
      }),
    );
    const r = await getRun("r1");
    expect(r).toEqual({ ok: false, error: "invalid_response" });
  });

  it("getRun : run valide (à plat) → SUCCÈS", async () => {
    const run = {
      id: "r1",
      projectKey: "real-estate-agent",
      agentId: "a1",
      status: "running",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(200, run));
    const r = await getRun("r1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual(run);
  });

  it("getRunEvents : événement sans `sequence` → error, PAS []", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      res(200, { events: [{ type: "message" }] }),
    );
    const r = await getRunEvents("r1");
    expect(r).toEqual({ ok: false, error: "invalid_response" });
  });

  it("getRunEvents : `{events:[]}` → SUCCÈS data:[] (pas encore d'event, honnête)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(200, { events: [] }));
    const r = await getRunEvents("r1");
    expect(r).toEqual({ ok: true, data: [] });
  });

  it("getAgent : corps `{}` (ni agent à plat, ni {agent}) → error, PAS un agent vide", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(200, {}));
    const r = await getAgent("a1");
    expect(r).toEqual({ ok: false, error: "invalid_response" });
  });

  it("createRun : réponse `{ok:true}` sans `run` → error (jamais un faux run créé)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(201, { ok: true }));
    const r = await createRun("a1", { input: 1 });
    expect(r).toEqual({ ok: false, error: "invalid_response" });
  });

  it("JSON illisible (HTML/corps tronqué) sur 200 → error, jamais un succès", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(200, null, { unparseable: true }));
    const r = await listAgents();
    expect(r).toEqual({ ok: false, error: "invalid_response" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TIMEOUT → `unavailable`/`unreachable`, PAS de hang.
// ─────────────────────────────────────────────────────────────────────────────
describe("timeout → unreachable, jamais de hang", () => {
  beforeEach(configureRuntime);

  it("un fetch qui n'aboutit jamais est ABORTé au-delà du délai → unavailable/unreachable", async () => {
    vi.useFakeTimers();
    // fetch qui rejette AbortError quand le signal est aborté (comportement réel).
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const p = listAgents();
    // Avance le temps au-delà du timeout borné (défaut 10000ms) → déclenche l'abort.
    await vi.advanceTimersByTimeAsync(10_001);
    const r = await p; // résout (ne hang pas)
    expect(r).toEqual({
      ok: false,
      unavailable: { available: false, reason: "unreachable" },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Codes HTTP distincts correctement mappés (états indisponibles ≠).
// ─────────────────────────────────────────────────────────────────────────────
describe("mapping des codes HTTP → états qualifiés", () => {
  beforeEach(configureRuntime);

  it("401/403 → unavailable/unauthorized", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(403, {}));
    const r = await listAgents();
    expect(r).toEqual({ ok: false, unavailable: { available: false, reason: "unauthorized" } });
  });

  it("503 → unavailable/not_provisioned (configuré mais pas branché)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(503, {}));
    const r = await listAgents();
    expect(r).toEqual({ ok: false, unavailable: { available: false, reason: "not_provisioned" } });
  });

  it("404 → notFound (agent/run non matérialisé)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(404, {}));
    const r = await getAgent("a1");
    expect(r).toEqual({ ok: false, notFound: true });
  });

  it("409 → conflict (resume hors waiting_on_input)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(409, {}));
    const r = await resumeRun("r1", { action: "approve" });
    expect(r).toEqual({ ok: false, conflict: true });
  });

  it("500 → error générique (jamais de détail interne)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(500, { stack: "secret internals" }));
    const r = await listAgents();
    expect(r).toEqual({ ok: false, error: "runtime_error" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Le token runtime n'est JAMAIS renvoyé au client (reste server-only).
// ─────────────────────────────────────────────────────────────────────────────
describe("token runtime server-only", () => {
  beforeEach(configureRuntime);

  it("le token voyage en Authorization mais N'APPARAÎT dans aucun RuntimeResult", async () => {
    let sentAuth: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const headers = new Headers((init as RequestInit | undefined)?.headers);
      sentAuth = headers.get("authorization") ?? undefined;
      return Promise.resolve(res(200, { agents: [] }));
    });
    const r = await listAgents();
    expect(sentAuth).toBe(`Bearer ${TOKEN}`); // envoyé au registre (OUTBOUND)
    // …mais jamais dans le résultat rendu à l'appelant.
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });
});
