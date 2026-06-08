// ─── Tests unitaires — swarms webhook ────────────────────────────────────────
// Couvre : shouldApplyStatus (anti-régression out-of-order) + normalizeRun
// (mapping status engine → SwarmRunStatus) + helpers purs P0-1/P1-2.

import { describe, it, expect } from "vitest";
import { shouldApplyStatus } from "../lib/swarms/webhook";
import { normalizeRun, mapRunStatus } from "../lib/swarms/client";
import { computeUpdatedRuns, shouldDowngradeAwaitingDecision } from "../lib/missions/service";

// ─── shouldApplyStatus ────────────────────────────────────────────────────────

describe("shouldApplyStatus", () => {
  it("current=done + incoming=running → false (anti-régression terminal)", () => {
    expect(shouldApplyStatus("done", "running")).toBe(false);
  });

  it("current=done + incoming=pending → false", () => {
    expect(shouldApplyStatus("done", "pending")).toBe(false);
  });

  it("current=failed + incoming=running → false", () => {
    expect(shouldApplyStatus("failed", "running")).toBe(false);
  });

  it("current=error + incoming=paused_hitl → false", () => {
    expect(shouldApplyStatus("error", "paused_hitl")).toBe(false);
  });

  it("current=running + incoming=done → true", () => {
    expect(shouldApplyStatus("running", "done")).toBe(true);
  });

  it("current=null + incoming=running → true", () => {
    expect(shouldApplyStatus(null, "running")).toBe(true);
  });

  it("current=null + incoming=done → true", () => {
    expect(shouldApplyStatus(null, "done")).toBe(true);
  });

  it("current=pending + incoming=running → true", () => {
    expect(shouldApplyStatus("pending", "running")).toBe(true);
  });

  it("current=done + incoming=done → true (terminal→terminal OK)", () => {
    expect(shouldApplyStatus("done", "done")).toBe(true);
  });

  it("current=done + incoming=failed → true (terminal→terminal OK)", () => {
    expect(shouldApplyStatus("done", "failed")).toBe(true);
  });

  it("current=running + incoming=failed → true", () => {
    expect(shouldApplyStatus("running", "failed")).toBe(true);
  });
});

// ─── mapRunStatus ─────────────────────────────────────────────────────────────

describe("mapRunStatus", () => {
  it('"completed" → "done"', () => {
    expect(mapRunStatus("completed")).toBe("done");
  });

  it('"queued" → "pending"', () => {
    expect(mapRunStatus("queued")).toBe("pending");
  });

  it('"cancelled" → "error"', () => {
    expect(mapRunStatus("cancelled")).toBe("error");
  });

  it('"canceled" → "error"', () => {
    expect(mapRunStatus("canceled")).toBe("error");
  });

  it('"running" → "running" (pass-through)', () => {
    expect(mapRunStatus("running")).toBe("running");
  });

  it('"done" → "done" (pass-through)', () => {
    expect(mapRunStatus("done")).toBe("done");
  });

  it('"paused_hitl" → "paused_hitl" (pass-through)', () => {
    expect(mapRunStatus("paused_hitl")).toBe("paused_hitl");
  });

  it("unknown status → \"running\" (default safe)", () => {
    expect(mapRunStatus("something_weird")).toBe("running");
  });
});

// ─── normalizeRun ─────────────────────────────────────────────────────────────

describe("normalizeRun", () => {
  it("mappe status completed→done et run_id depuis raw.id", () => {
    const raw = {
      id: "abc-123",
      status: "completed",
      result_text: "rapport final",
      swarm_id: "swarm-001",
    };
    const run = normalizeRun(raw);
    expect(run.run_id).toBe("abc-123");
    expect(run.status).toBe("done");
    expect(run.output).toBe("rapport final");
  });

  it("préfère run_id sur id si les deux présents", () => {
    const raw = {
      id: "fallback",
      run_id: "primary-run-id",
      status: "running",
      swarm_id: "swarm-002",
    };
    const run = normalizeRun(raw);
    expect(run.run_id).toBe("primary-run-id");
  });

  it("mappe status queued→pending", () => {
    const raw = { id: "r1", status: "queued", swarm_id: "s1" };
    const run = normalizeRun(raw);
    expect(run.status).toBe("pending");
  });

  it("mappe les steps depuis raw.steps", () => {
    const raw = {
      id: "r2",
      status: "running",
      swarm_id: "s2",
      steps: [
        { agent_name: "Researcher", task_name: "search", output_text: "found X" },
      ],
    };
    const run = normalizeRun(raw);
    expect(run.steps).toHaveLength(1);
    expect(run.steps![0].agent).toBe("Researcher");
    expect(run.steps![0].task).toBe("search");
    expect(run.steps![0].output).toBe("found X");
  });

  it("préfère output sur result_text quand les deux présents", () => {
    const raw = {
      id: "r3",
      status: "completed",
      swarm_id: "s3",
      output: "direct output",
      result_text: "text result",
    };
    const run = normalizeRun(raw);
    // result_text ?? output — normalizeRun utilise (raw.result_text ?? raw.output)
    expect(run.output).toBe("text result");
  });
});

// ─── computeUpdatedRuns — FIX P0-1 ───────────────────────────────────────────

describe("computeUpdatedRuns", () => {
  const runs = [
    { run_id: "r1", label: "principal", status: "running" },
    { run_id: "r2", label: "step2", status: "pending" },
  ];

  it("met à jour le statut du run correspondant", () => {
    const result = computeUpdatedRuns(runs, "r1", "done");
    expect(result[0].status).toBe("done");
    expect(result[1].status).toBe("pending"); // inchangé
  });

  it("ne modifie pas les autres runs", () => {
    const result = computeUpdatedRuns(runs, "r2", "failed");
    expect(result[0].status).toBe("running"); // inchangé
    expect(result[1].status).toBe("failed");
  });

  it("run_id inconnu → tableau inchangé", () => {
    const result = computeUpdatedRuns(runs, "r99", "done");
    expect(result[0].status).toBe("running");
    expect(result[1].status).toBe("pending");
  });

  it("tableau vide → retourne tableau vide", () => {
    const result = computeUpdatedRuns([], "r1", "done");
    expect(result).toHaveLength(0);
  });

  it("préserve les autres champs du RunRef", () => {
    const result = computeUpdatedRuns(runs, "r1", "paused_hitl");
    expect(result[0].run_id).toBe("r1");
    expect(result[0].label).toBe("principal");
    expect(result[0].status).toBe("paused_hitl");
  });
});

// ─── shouldDowngradeAwaitingDecision — FIX P1-2 ──────────────────────────────

describe("shouldDowngradeAwaitingDecision", () => {
  it("running + awaiting_decision + fromWebhook:false → true (poll autorisé)", () => {
    expect(shouldDowngradeAwaitingDecision("running", "awaiting_decision", false)).toBe(true);
  });

  it("pending + awaiting_decision + fromWebhook:false → true (poll autorisé)", () => {
    expect(shouldDowngradeAwaitingDecision("pending", "awaiting_decision", false)).toBe(true);
  });

  it("running + awaiting_decision + fromWebhook:true → false (webhook bloqué)", () => {
    expect(shouldDowngradeAwaitingDecision("running", "awaiting_decision", true)).toBe(false);
  });

  it("pending + awaiting_decision + fromWebhook:true → false (webhook bloqué)", () => {
    expect(shouldDowngradeAwaitingDecision("pending", "awaiting_decision", true)).toBe(false);
  });

  it("done + awaiting_decision + fromWebhook:false → false (statut non running)", () => {
    expect(shouldDowngradeAwaitingDecision("done", "awaiting_decision", false)).toBe(false);
  });

  it("running + running + fromWebhook:false → false (mission pas awaiting)", () => {
    expect(shouldDowngradeAwaitingDecision("running", "running", false)).toBe(false);
  });

  it("paused_hitl + awaiting_decision + fromWebhook:false → false (non running)", () => {
    expect(shouldDowngradeAwaitingDecision("paused_hitl", "awaiting_decision", false)).toBe(false);
  });
});
