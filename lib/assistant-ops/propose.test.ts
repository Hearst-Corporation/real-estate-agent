/**
 * lib/assistant-ops/propose.test.ts — le moteur de proposition (W9).
 *
 * Ce que ces tests VERROUILLENT (invariants de vérité) :
 *   1. Toute proposition DÉRIVE d'un signal réel — aucune source ⇒ aucune sortie.
 *   2. La priorisation est DÉTERMINISTE et EXPLICABLE (facteurs nommés).
 *   3. Aucune proposition ne porte d'action mutante directe : uniquement
 *      `open` (navigation), `draft` (brouillon HITL) ou `approval` (boîte HITL).
 *   4. Une carte d'approbation route vers l'APPROBATION, jamais vers une exécution.
 */

import { describe, it, expect } from "vitest";
import { buildProposals, type ProposeLabels } from "@/lib/assistant-ops/propose";
import type { ScoredAction } from "@/lib/action-center/types";
import type { ConversionReport } from "@/lib/conversion/types";
import type { DormantProspect } from "@/lib/reactivation/types";

const LABELS: ProposeLabels = {
  funnelLeak: (pct, stage) => `leak:${pct}:${stage}`,
  funnelTitle: (stage) => `title:${stage}`,
  stageLabel: (stage) => `stage:${stage}`,
  reactivationRationale: (name, days, role) => `react:${name}:${days}:${role}`,
  reactivationTitle: (name) => `relance:${name}`,
  roleLabel: (role) => `role:${role}`,
};

/** Carte scorée minimale (toutes les propriétés obligatoires d'ActionItem). */
function scored(over: Partial<ScoredAction> = {}): ScoredAction {
  return {
    id: "relance:lead-1",
    category: "relance",
    entity: "lead",
    entityId: "11111111-1111-4111-8111-111111111111",
    title: "Marie Dupont",
    reason: "Sans contact depuis 30 j",
    priority: "haute",
    href: "/leads/11111111-1111-4111-8111-111111111111",
    quick: [{ kind: "message", leadId: "11111111-1111-4111-8111-111111111111" }],
    score: 80,
    explanation: [
      { factor: "base", points: 50 },
      { factor: "priority", points: 30 },
    ],
    topFactor: "base",
    ...over,
  } as ScoredAction;
}

function conversion(over: Partial<ConversionReport> = {}): ConversionReport {
  return {
    segment: "all",
    grain: "month",
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-08-01T00:00:00.000Z",
    totalLeads: 40,
    stages: [],
    delays: [],
    // 60 % des pertes à l'étage "engaged" → au-dessus du seuil (25 %).
    losses: [
      { stage: "engaged", lost: 6, share: 0.6 },
      { stage: "qualified", lost: 4, share: 0.4 },
    ],
    winRate: 0.2,
    lossRate: 0.25,
    ...over,
  };
}

function dormant(over: Partial<DormantProspect> = {}): DormantProspect {
  return {
    role: "acquereur",
    lead_id: "22222222-2222-4222-8222-222222222222",
    source_id: "22222222-2222-4222-8222-222222222222",
    full_name: "Paul Martin",
    email: "paul@example.test",
    phone: null,
    jours_inactif: 60,
    last_activity_at: "2026-05-19T10:00:00.000Z",
    reasons: [{ code: "no_activity_since", label: "Sans activité depuis 60 j" }],
    match_hints: [],
    suggested_channel: "email",
    ...over,
  };
}

describe("buildProposals — dérivation depuis des signaux RÉELS", () => {
  it("ne produit AUCUNE proposition quand toutes les sources sont absentes", () => {
    const out = buildProposals({
      scored: null,
      conversion: null,
      dormant: null,
      labels: LABELS,
    });
    // Aucune source ⇒ aucune sortie fabriquée pour « remplir » l'écran.
    expect(out).toEqual([]);
  });

  it("ne produit rien non plus quand les sources existent mais sont vides", () => {
    const out = buildProposals({
      scored: [],
      conversion: conversion({ losses: [] }),
      dormant: [],
      labels: LABELS,
    });
    expect(out).toEqual([]);
  });

  it("dérive une proposition d'une carte scorée en héritant score + facteurs", () => {
    const out = buildProposals({
      scored: [scored()],
      conversion: null,
      dormant: null,
      labels: LABELS,
    });
    expect(out).toHaveLength(1);
    const p = out[0];
    expect(p.source).toBe("action");
    expect(p.priority).toBe(80);
    expect(p.urgency).toBe("haute");
    // Explicabilité : les facteurs du score sont conservés, nommés.
    expect(p.factors).toEqual([
      { factor: "base", points: 50 },
      { factor: "priority", points: 30 },
    ]);
  });

  it("est DÉTERMINISTE : deux exécutions sur la même entrée donnent le même résultat", () => {
    const input = {
      scored: [scored(), scored({ id: "rdv:x", score: 40, entity: "visit" as const })],
      conversion: conversion(),
      dormant: [dormant()],
      labels: LABELS,
    };
    expect(buildProposals(input)).toEqual(buildProposals(input));
  });

  it("trie par priorité décroissante", () => {
    const out = buildProposals({
      scored: [
        scored({ id: "a", score: 20 }),
        scored({ id: "b", score: 90 }),
        scored({ id: "c", score: 55 }),
      ],
      conversion: null,
      dormant: null,
      labels: LABELS,
    });
    const scores = out.map((p) => p.priority);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
  });
});

describe("buildProposals — AUCUNE action mutante directe", () => {
  it("ne renvoie jamais autre chose que open / draft / approval", () => {
    const out = buildProposals({
      scored: [
        scored(),
        scored({ id: "val:1", category: "validation", entity: "general" }),
        scored({ id: "rdv:1", entity: "visit", quick: [{ kind: "open", href: "/visits" }] }),
      ],
      conversion: conversion(),
      dormant: [dormant(), dormant({ source_id: "s2", suggested_channel: null, lead_id: null })],
      labels: LABELS,
    });
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) {
      expect(["open", "draft", "approval"]).toContain(p.action.kind);
    }
  });

  it("route une carte d'approbation vers la boîte HITL (jamais une exécution)", () => {
    const out = buildProposals({
      scored: [
        scored({
          id: "approval:abc",
          category: "validation",
          entity: "general",
          entityId: "33333333-3333-4333-8333-333333333333",
          href: "/approvals",
          quick: [{ kind: "validate" }],
        }),
      ],
      conversion: null,
      dormant: null,
      labels: LABELS,
    });
    expect(out[0].action).toEqual({
      kind: "approval",
      approvalId: "33333333-3333-4333-8333-333333333333",
      href: "/approvals",
    });
  });

  it("propose un BROUILLON (jamais un envoi) pour un lead contactable", () => {
    const out = buildProposals({
      scored: [scored()],
      conversion: null,
      dormant: null,
      labels: LABELS,
    });
    expect(out[0].action.kind).toBe("draft");
    if (out[0].action.kind === "draft") {
      expect(out[0].action.channel).toBe("email");
      expect(out[0].action.leadId).toBe("11111111-1111-4111-8111-111111111111");
    }
  });

  it("retombe sur `open` quand aucun contact n'est possible", () => {
    const out = buildProposals({
      scored: [
        scored({
          entity: "property",
          quick: [{ kind: "open", href: "/properties/x" }],
          href: "/properties/x",
        }),
      ],
      conversion: null,
      dormant: null,
      labels: LABELS,
    });
    expect(out[0].action).toEqual({ kind: "open", href: "/properties/x" });
  });
});

describe("buildProposals — fuite de conversion", () => {
  it("propose l'étage où la perte se concentre, avec le facteur nommé", () => {
    const out = buildProposals({
      scored: null,
      conversion: conversion(),
      dormant: null,
      labels: LABELS,
    });
    expect(out).toHaveLength(1);
    const p = out[0];
    expect(p.source).toBe("conversion");
    expect(p.id).toBe("conversion:engaged");
    // 60 % de pertes → libellé chiffré déterministe, jamais un texte vague.
    expect(p.rationale).toBe("leak:60:stage:engaged");
    expect(p.factors[0].factor).toBe("funnelLeak");
    expect(p.action).toEqual({ kind: "open", href: "/conversion#engaged" });
  });

  it("ne propose RIEN quand la perte n'est pas concentrée (sous le seuil)", () => {
    const out = buildProposals({
      scored: null,
      // 10 % seulement → sous ASSISTANT_FUNNEL_LEAK_MIN_PCT (25 %).
      conversion: conversion({ losses: [{ stage: "engaged", lost: 1, share: 0.1 }] }),
      dormant: null,
      labels: LABELS,
    });
    expect(out).toEqual([]);
  });
});

describe("buildProposals — réactivation des dormants", () => {
  it("propose un brouillon quand un canal ET un lead réels existent", () => {
    const out = buildProposals({
      scored: null,
      conversion: null,
      dormant: [dormant()],
      labels: LABELS,
    });
    expect(out).toHaveLength(1);
    const p = out[0];
    expect(p.source).toBe("reactivation");
    expect(p.action).toEqual({
      kind: "draft",
      leadId: "22222222-2222-4222-8222-222222222222",
      channel: "email",
      href: "/leads/22222222-2222-4222-8222-222222222222",
    });
    // Explicabilité : la profondeur d'inactivité est un facteur nommé.
    expect(p.factors.map((f) => f.factor)).toContain("dormantDepth");
  });

  it("retombe sur `open` sans canal exploitable (jamais de brouillon sans coordonnée)", () => {
    const out = buildProposals({
      scored: null,
      conversion: null,
      dormant: [dormant({ suggested_channel: null, email: null, phone: null })],
      labels: LABELS,
    });
    expect(out[0].action.kind).toBe("open");
  });

  it("fait monter la priorité avec l'inactivité et les biens pertinents", () => {
    const shallow = buildProposals({
      scored: null,
      conversion: null,
      dormant: [dormant({ jours_inactif: 10, source_id: "s-shallow" })],
      labels: LABELS,
    })[0];
    const deep = buildProposals({
      scored: null,
      conversion: null,
      dormant: [
        dormant({
          jours_inactif: 120,
          source_id: "s-deep",
          match_hints: [
            { property_id: "p1", title: "T2", city: "Lyon", asking_price: 200000 },
            { property_id: "p2", title: "T3", city: "Lyon", asking_price: 250000 },
          ],
        }),
      ],
      labels: LABELS,
    })[0];
    expect(deep.priority).toBeGreaterThan(shallow.priority);
    expect(deep.factors.map((f) => f.factor)).toContain("matchOpportunity");
  });
});
