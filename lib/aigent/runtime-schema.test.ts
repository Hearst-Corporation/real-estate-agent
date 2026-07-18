/**
 * Validation stricte des réponses runtime — parsers directs (`runtime-schema.ts`).
 * =================================================================
 *
 * Frontière « la forme est-elle réelle ? ». Un parser échoue (`ok:false`) plutôt
 * que de fabriquer une valeur de secours — c'est ce qui empêche un 200 malformé
 * de devenir une liste vide ou un run factice en amont (`runtime.ts`).
 */
import { describe, expect, it } from "vitest";
import {
  parseAgent,
  parseAgentList,
  parseEventList,
  parseRun,
} from "@/lib/aigent/runtime-schema";

const AGENT = {
  id: "seller-copilot",
  projectKey: "real-estate-agent",
  name: "Copilote vendeur",
  status: "production" as const,
};

const RUN = {
  id: "run-1",
  projectKey: "real-estate-agent",
  agentId: "seller-copilot",
  status: "running" as const,
};

describe("parseAgentList", () => {
  it("accepte l'enveloppe {agents:[…]} valide", () => {
    expect(parseAgentList({ agents: [AGENT] })).toEqual({ ok: true, value: [AGENT] });
  });
  it("accepte le tableau nu [ … ]", () => {
    expect(parseAgentList([AGENT])).toEqual({ ok: true, value: [AGENT] });
  });
  it("accepte le registre vide {agents:[]} (état honnête)", () => {
    expect(parseAgentList({ agents: [] })).toEqual({ ok: true, value: [] });
  });
  it("REFUSE un agent sans status (jamais coercé en liste)", () => {
    expect(parseAgentList({ agents: [{ id: "x", projectKey: "p", name: "n" }] })).toEqual({
      ok: false,
    });
  });
  it("REFUSE `agents` absent (ne retombe PAS sur [])", () => {
    expect(parseAgentList({ nope: true })).toEqual({ ok: false });
  });
  it("REFUSE null / primitives", () => {
    expect(parseAgentList(null).ok).toBe(false);
    expect(parseAgentList("agents").ok).toBe(false);
    expect(parseAgentList(42).ok).toBe(false);
  });
  it("tolère des champs additionnels du producteur (.loose)", () => {
    const enriched = { ...AGENT, futureField: "ignoré" };
    const r = parseAgentList({ agents: [enriched], meta: { page: 1 } });
    expect(r.ok).toBe(true);
  });
});

describe("parseRun", () => {
  it("accepte {run:{…}} valide", () => {
    expect(parseRun({ run: RUN })).toEqual({ ok: true, value: RUN });
  });
  it("accepte le run à plat", () => {
    expect(parseRun(RUN)).toEqual({ ok: true, value: RUN });
  });
  it("REFUSE un run sans status (jamais {} factice)", () => {
    expect(parseRun({ run: { id: "r", projectKey: "p", agentId: "a" } })).toEqual({ ok: false });
  });
  it("REFUSE un status hors enum", () => {
    expect(parseRun({ ...RUN, status: "exploded" })).toEqual({ ok: false });
  });
  it("REFUSE {} (objet vide)", () => {
    expect(parseRun({})).toEqual({ ok: false });
  });
  it("accepte un run failed avec error structuré", () => {
    const failed = { ...RUN, status: "failed" as const, error: { code: "E1", message: "boom" } };
    expect(parseRun(failed)).toEqual({ ok: true, value: failed });
  });
});

describe("parseEventList", () => {
  it("accepte {events:[…]} valide", () => {
    const e = { sequence: 0, type: "message" };
    expect(parseEventList({ events: [e] })).toEqual({ ok: true, value: [e] });
  });
  it("accepte {events:[]} (pas encore d'event)", () => {
    expect(parseEventList({ events: [] })).toEqual({ ok: true, value: [] });
  });
  it("REFUSE un event sans sequence (curseur cassé)", () => {
    expect(parseEventList({ events: [{ type: "message" }] })).toEqual({ ok: false });
  });
  it("REFUSE une sequence négative", () => {
    expect(parseEventList({ events: [{ sequence: -1, type: "m" }] })).toEqual({ ok: false });
  });
});

describe("parseAgent", () => {
  it("accepte {agent:{…}} et l'agent à plat", () => {
    expect(parseAgent({ agent: AGENT })).toEqual({ ok: true, value: AGENT });
    expect(parseAgent(AGENT)).toEqual({ ok: true, value: AGENT });
  });
  it("REFUSE {} (ni agent, ni {agent})", () => {
    expect(parseAgent({})).toEqual({ ok: false });
  });
});
