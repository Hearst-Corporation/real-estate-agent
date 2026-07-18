/**
 * Tours W5 — « communications-hitl » et « agents ».
 * =================================================================
 *
 * Vérifie le contrat (étapes, ancres, registre), l'HONNÊTETÉ des textes (aucun
 * faux LIVE, état CONFIG d'Aigent expliqué sans simulation) et la PRÉSENCE réelle
 * de chaque ancre `data-tour-id` dans les composants ciblés — une ancre qui
 * disparaît du JSX fait échouer ce test au lieu de casser silencieusement la
 * visite en production.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UI } from "@/lib/ui-strings";
import { getTour } from "../tours";
import { validateTour } from "../progress";
import type { TourDefinition } from "../types";
import { AGENTS_ANCHORS, agentsTour } from "./agents";
import { COMMUNICATIONS_ANCHORS, communicationsHitlTour } from "./communications-hitl";

const ROOT = join(__dirname, "..", "..", "..");

/**
 * Où chaque ancre doit être posée (composant RESPONSABLE de l'action), et sous
 * quelle expression : les composants référencent la CONSTANTE partagée, jamais
 * une chaîne recopiée — c'est ce qui empêche une ancre de diverger du tour.
 */
const ANCHOR_HOST: Record<string, { file: string; expr: string }> = {
  [COMMUNICATIONS_ANCHORS.transports]: {
    file: "app/(dashboard)/outbox/_components/OutboxBoard.tsx",
    expr: "COMMUNICATIONS_ANCHORS.transports",
  },
  [COMMUNICATIONS_ANCHORS.statusTabs]: {
    file: "app/(dashboard)/outbox/_components/OutboxBoard.tsx",
    expr: "COMMUNICATIONS_ANCHORS.statusTabs",
  },
  [COMMUNICATIONS_ANCHORS.draftActions]: {
    file: "app/(dashboard)/outbox/_components/OutboxBoard.tsx",
    expr: "COMMUNICATIONS_ANCHORS.draftActions",
  },
  [COMMUNICATIONS_ANCHORS.pending]: {
    file: "app/(dashboard)/approvals/_components/ApprovalsInbox.tsx",
    expr: "COMMUNICATIONS_ANCHORS.pending",
  },
  [COMMUNICATIONS_ANCHORS.decision]: {
    file: "app/(dashboard)/approvals/_components/ApprovalsInbox.tsx",
    expr: "COMMUNICATIONS_ANCHORS.decision",
  },
  [AGENTS_ANCHORS.registry]: {
    file: "app/(dashboard)/agents/_components/AgentsCockpit.tsx",
    expr: "AGENTS_ANCHORS.registry",
  },
  [AGENTS_ANCHORS.run]: {
    file: "app/(dashboard)/agents/_components/AgentCard.tsx",
    expr: "AGENTS_ANCHORS.run",
  },
  [AGENTS_ANCHORS.hitl]: {
    file: "app/(dashboard)/agents/_components/RunTracker.tsx",
    expr: "AGENTS_ANCHORS.hitl",
  },
};

function anchorsOf(tour: TourDefinition): string[] {
  return [...new Set(tour.steps.map((s) => s.anchor).filter((a): a is string => Boolean(a)))];
}

function readSource(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("tour communications-hitl v1", () => {
  it("est valide et branché dans le registre", () => {
    expect(validateTour(communicationsHitlTour)).toEqual([]);
    expect(getTour("communications-hitl")).toBe(communicationsHitlTour);
    expect(communicationsHitlTour.version).toBe(1);
    expect(communicationsHitlTour.entryRoute).toBe("/outbox");
  });

  it("compte 8 étapes : 5 outbox + 3 approbations", () => {
    expect(communicationsHitlTour.steps.map((s) => s.id)).toEqual([
      "transports",
      "tabs",
      "edit",
      "validate",
      "send",
      "proposal",
      "justification",
      "decision",
    ]);
    const outbox = communicationsHitlTour.steps.filter((s) => s.route === "/outbox");
    const approvals = communicationsHitlTour.steps.filter((s) => s.route === "/approvals");
    expect(outbox).toHaveLength(5);
    expect(approvals).toHaveLength(3);
  });

  it("porte le texte imposé sur la décision d'approbation", () => {
    const decision = communicationsHitlTour.steps.find((s) => s.id === "decision");
    expect(decision?.consequence).toBe(
      "Votre décision est enregistrée. Cette page n'exécute jamais silencieusement l'action.",
    );
  });

  it("dit l'état RÉEL des canaux, sans faux LIVE", () => {
    const transports = communicationsHitlTour.steps.find((s) => s.id === "transports");
    const text = `${transports?.body} ${transports?.consequence}`;
    // Twilio en CONFIG, Resend configuré mais jamais éprouvé en envoi réel.
    expect(text).toMatch(/CONFIG/);
    expect(text).toMatch(/Twilio/);
    expect(text).toMatch(/Resend/);
    expect(text).toMatch(/aucun envoi réel n'a encore été effectué/);
  });

  it("conditionne l'envoi à la validation ET à une référence fournisseur réelle", () => {
    const send = communicationsHitlTour.steps.find((s) => s.id === "send");
    expect(send?.body).toMatch(/déjà validé/);
    expect(send?.consequence).toMatch(/référence fournisseur réelle/);
    expect(send?.consequence).toMatch(/jamais de faux envoi/);
  });
});

describe("tour agents v1", () => {
  it("est valide et branché dans le registre", () => {
    expect(validateTour(agentsTour)).toEqual([]);
    expect(getTour("agents")).toBe(agentsTour);
    expect(agentsTour.version).toBe(1);
    expect(agentsTour.entryRoute).toBe("/agents");
  });

  it("compte 4 étapes sur /agents", () => {
    expect(agentsTour.steps.map((s) => s.id)).toEqual([
      "registry",
      "capabilities",
      "run",
      "hitl",
    ]);
    expect(agentsTour.steps.every((s) => s.route === "/agents")).toBe(true);
  });

  it("porte la frontière imposée : les agents viennent d'Aigent", () => {
    const registry = agentsTour.steps.find((s) => s.id === "registry");
    expect(registry?.consequence).toBe(
      "Les agents ne sont pas créés dans ce dashboard. Ils sont publiés par Aigent puis exploités ici.",
    );
  });

  it("explique l'état CONFIG d'Aigent SANS simuler d'agent", () => {
    const all = agentsTour.steps
      .map((s) => `${s.title} ${s.body} ${s.consequence ?? ""}`)
      .join(" ");
    expect(all).toMatch(/n'est pas connecté/);
    expect(all).toMatch(/variables d'accès sont absentes/);
    expect(all).toMatch(/ne renvoie donc aucun agent/);
    // Aucune promesse de disponibilité : jamais de faux statut LIVE.
    expect(all).not.toMatch(/\bLIVE\b/);
  });

  it("laisse les étapes dépendant d'un agent publié se dégrader proprement", () => {
    // Registre vide (état vrai aujourd'hui) → ancres absentes, jamais de blocage.
    for (const id of ["run", "hitl"]) {
      const step = agentsTour.steps.find((s) => s.id === id);
      expect(step?.onMissing).toBe("center");
    }
  });
});

describe("ancres (LOT 2) — posées sur les vrais composants", () => {
  const anchors = [...anchorsOf(communicationsHitlTour), ...anchorsOf(agentsTour)];

  it("couvre exactement les 8 ancres du périmètre W5", () => {
    expect(anchors.sort()).toEqual(
      [
        "agents-hitl",
        "agents-registry",
        "agents-run",
        "approvals-decision",
        "approvals-pending",
        "outbox-draft-actions",
        "outbox-status-tabs",
        "outbox-transports",
      ].sort(),
    );
  });

  it.each(Object.entries(ANCHOR_HOST))(
    "l'ancre %s est posée sur son composant réel",
    (_anchor, { file, expr }) => {
      const src = readSource(file);
      // Posée via la constante partagée (jamais un sélecteur CSS ni nth-child).
      expect(src).toMatch(/data-tour-id=/);
      expect(src).toContain(expr);
    },
  );

  it("aucune étape n'utilise de sélecteur CSS", () => {
    for (const step of [...communicationsHitlTour.steps, ...agentsTour.steps]) {
      if (!step.anchor) continue;
      expect(step.anchor).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("textes (LOT 8) — tous dans lib/ui-strings", () => {
  it("chaque étape référence bien la section UI isolée de W5", () => {
    const comms = UI.onboarding.tours["communications-hitl"];
    const agents = UI.onboarding.tours.agents;
    for (const step of communicationsHitlTour.steps) {
      const s = comms.steps[step.id as keyof typeof comms.steps];
      expect(step.title).toBe(s.title);
      expect(step.body).toBe(s.body);
    }
    for (const step of agentsTour.steps) {
      const s = agents.steps[step.id as keyof typeof agents.steps];
      expect(step.title).toBe(s.title);
      expect(step.body).toBe(s.body);
    }
  });

  it("aucune étape ne dit « cliquez ici »", () => {
    for (const step of [...communicationsHitlTour.steps, ...agentsTour.steps]) {
      const text = `${step.title} ${step.body} ${step.consequence ?? ""}`.toLowerCase();
      expect(text).not.toMatch(/cliquez ici/);
    }
  });
});
