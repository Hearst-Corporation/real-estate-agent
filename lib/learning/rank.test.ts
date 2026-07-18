import { describe, it, expect } from "vitest";
import { adjustMatch, rankMatches, type RankableMatch } from "./rank";
import { deriveLearningProfile } from "./signals";
import type { FeedbackEvent, LearningProfile } from "./types";

function evt(polarity: FeedbackEvent["polarity"], criteriaMet: FeedbackEvent["criteriaMet"]): FeedbackEvent {
  return { source: "prosp_match", polarity, criteriaMet };
}

/** Profil vide (aucun feedback) → identité. */
const emptyProfile: LearningProfile = deriveLearningProfile("c", []);

describe("adjustMatch — ajustement déterministe par-dessus le moteur", () => {
  const match: RankableMatch = {
    matchId: "m1",
    baseScore: 70,
    breakdown: { zone: 40, budget: 20, surface: 15, typeBien: 10, confort: 0 },
  };

  it("sans profil exploitable → score inchangé (identité stricte)", () => {
    const out = adjustMatch(match, emptyProfile);
    expect(out.adjustedScore).toBe(match.baseScore);
    expect(out.delta).toBe(0);
    expect(out.changeReasons).toEqual([]);
  });

  it("un critère bloquant renforce le poids (score et raisons changent)", () => {
    const profile = deriveLearningProfile("c", [
      evt("negative", { zone: false }),
      evt("negative", { zone: false }),
      evt("negative", { zone: false }),
    ]);
    const out = adjustMatch(match, profile);
    expect(out.adjustedScore).toBeGreaterThanOrEqual(match.baseScore);
    expect(out.changeReasons.join(" ")).toMatch(/zone renforcé/i);
    const zoneFactor = out.factors.find((f) => f.criterion === "zone");
    expect(zoneFactor?.weightFactor).toBeGreaterThan(1);
    expect(zoneFactor?.status).toBe("bloquant");
  });

  it("un critère toléré assouplit le poids", () => {
    const profile = deriveLearningProfile("c", [
      evt("positive", { budget: false }),
      evt("positive", { budget: false }),
    ]);
    const out = adjustMatch(match, profile);
    const budgetFactor = out.factors.find((f) => f.criterion === "budget");
    expect(budgetFactor?.weightFactor).toBeLessThan(1);
    expect(out.changeReasons.join(" ")).toMatch(/budget assoupli/i);
  });

  it("le score ajusté reste borné 0-100", () => {
    const profile = deriveLearningProfile("c", [
      evt("negative", { zone: false }),
      evt("negative", { zone: false }),
    ]);
    const big: RankableMatch = { matchId: "m", baseScore: 95, breakdown: { zone: 40, budget: 20, surface: 15, typeBien: 10 } };
    const out = adjustMatch(big, profile);
    expect(out.adjustedScore).toBeGreaterThanOrEqual(0);
    expect(out.adjustedScore).toBeLessThanOrEqual(100);
  });
});

describe("rankMatches — re-classement stable", () => {
  it("trie par score ajusté puis base puis id (déterministe)", () => {
    const matches: RankableMatch[] = [
      { matchId: "b", baseScore: 60, breakdown: { zone: 40, budget: 20 } },
      { matchId: "a", baseScore: 60, breakdown: { zone: 40, budget: 20 } },
      { matchId: "c", baseScore: 80, breakdown: { zone: 40, budget: 20, surface: 15, typeBien: 10 } },
    ];
    const out = rankMatches(matches, emptyProfile);
    expect(out.map((m) => m.matchId)).toEqual(["c", "a", "b"]);
  });

  it("un profil bloquant remonte les matchs où le critère bloquant est satisfait", () => {
    // zone bloquante : les matchs avec zone conforme (points pleins) sont renforcés.
    const profile = deriveLearningProfile("c", [
      evt("negative", { zone: false }),
      evt("negative", { zone: false }),
      evt("negative", { zone: false }),
    ]);
    const zoneOk: RankableMatch = { matchId: "zoneok", baseScore: 55, breakdown: { zone: 40, budget: 20 } };
    const zoneKo: RankableMatch = { matchId: "zoneko", baseScore: 55, breakdown: { zone: 0, budget: 20, surface: 15, pieces: 10, typeBien: 10 } };
    const out = rankMatches([zoneKo, zoneOk], profile);
    expect(out[0].matchId).toBe("zoneok");
  });
});
