/**
 * LOT 10 — preuve que le mode visite ne peut RIEN déclencher (W5).
 * =================================================================
 *
 * Deux niveaux de preuve, tous deux déterministes :
 *
 *  1. LOGIQUE — `blockDuringTour()` refuse chaque geste irréversible dès que
 *     `tourActive` est vrai, et ne bloque jamais hors visite.
 *  2. CÂBLAGE — audit du SOURCE des composants sensibles : chaque appel `fetch`
 *     mutant (POST/PATCH) d'une surface sensible est couvert par un garde-fou,
 *     et chaque geste répertorié est effectivement câblé dans son composant.
 *     Ce niveau est ce qui empêche une régression silencieuse : ajouter demain
 *     un envoi sans garde-fou fait ÉCHOUER ce test.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TOUR_BLOCKED_ACTIONS,
  blockDuringTour,
  disabledDuringTour,
  type TourBlockedAction,
} from "./tour-guard";

const ROOT = join(__dirname, "..", "..");

/** Surfaces sensibles de W5 : outbox, approbations, agents. */
const SENSITIVE_FILES: Record<string, TourBlockedAction[]> = {
  "app/(dashboard)/outbox/_components/OutboxBoard.tsx": [
    "outbox-edit-save",
    "outbox-approve",
    "outbox-send",
    "outbox-cancel",
  ],
  "app/(dashboard)/approvals/_components/ApprovalsInbox.tsx": ["approvals-decision"],
  "app/(dashboard)/agents/_components/AgentCard.tsx": ["agents-run"],
  "app/(dashboard)/agents/_components/RunTracker.tsx": ["agents-hitl-decision"],
};

function readSource(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Nombre d'appels `fetch` MUTANTS (POST/PATCH/PUT/DELETE) dans un fichier. */
function countMutatingFetches(src: string): number {
  return (src.match(/method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/g) ?? []).length;
}

/** Nombre de garde-fous `blockDuringTour(...)` posés dans un fichier. */
function countGuards(src: string): number {
  return (src.match(/blockDuringTour\(/g) ?? []).length;
}

describe("blockDuringTour — logique du garde-fou", () => {
  it("bloque TOUS les gestes irréversibles pendant une visite", () => {
    for (const action of TOUR_BLOCKED_ACTIONS) {
      expect(blockDuringTour(true, action), `geste non bloqué : ${action}`).toBe(true);
    }
  });

  it("ne bloque RIEN hors visite (le produit fonctionne normalement)", () => {
    for (const action of TOUR_BLOCKED_ACTIONS) {
      expect(blockDuringTour(false, action), `geste bloqué à tort : ${action}`).toBe(false);
    }
  });

  it("couvre les trois gestes interdits du LOT 10 : envoyer, décider, lancer", () => {
    expect(blockDuringTour(true, "outbox-send")).toBe(true);
    expect(blockDuringTour(true, "approvals-decision")).toBe(true);
    expect(blockDuringTour(true, "agents-hitl-decision")).toBe(true);
    expect(blockDuringTour(true, "agents-run")).toBe(true);
  });

  it("désactive le contrôle à l'écran exactement quand il bloque le handler", () => {
    for (const action of TOUR_BLOCKED_ACTIONS) {
      expect(disabledDuringTour(true, action)).toBe(blockDuringTour(true, action));
      expect(disabledDuringTour(false, action)).toBe(blockDuringTour(false, action));
    }
  });

  it("un handler gardé n'atteint jamais son effet de bord pendant une visite", () => {
    // Simule le motif réel : `if (blockDuringTour(...)) return;` en tête de handler.
    let sent = 0;
    const send = (tourActive: boolean) => {
      if (blockDuringTour(tourActive, "outbox-send")) return;
      sent += 1;
    };
    send(true);
    send(true);
    expect(sent).toBe(0); // visite : aucun envoi
    send(false);
    expect(sent).toBe(1); // hors visite : l'envoi part normalement
  });
});

describe("câblage réel des surfaces sensibles (audit du source)", () => {
  it.each(Object.entries(SENSITIVE_FILES))(
    "%s lit tourActive et garde chacun de ses gestes",
    (rel, actions) => {
      const src = readSource(rel);
      // Le composant doit consommer le drapeau de visite (contexte ou prop).
      expect(src).toMatch(/tourActive/);
      expect(src).toContain('from "@/lib/onboarding/tour-guard"');
      for (const action of actions) {
        expect(
          src.includes(`blockDuringTour(tourActive, "${action}")`),
          `garde-fou absent pour ${action} dans ${rel}`,
        ).toBe(true);
      }
    },
  );

  it.each(Object.keys(SENSITIVE_FILES))(
    "%s : aucun fetch mutant sans garde-fou",
    (rel) => {
      const src = readSource(rel);
      const mutations = countMutatingFetches(src);
      const guards = countGuards(src);
      // Un `import` compte pour 0 (pas d'appel) : on compare les APPELS.
      expect(mutations).toBeGreaterThan(0); // le fichier est bien une surface mutante
      expect(
        guards,
        `${rel} : ${mutations} mutation(s) pour seulement ${guards} garde-fou(s)`,
      ).toBeGreaterThanOrEqual(mutations);
    },
  );

  it("le bouton d'envoi, les décisions et le lancement sont inertes pendant la visite", () => {
    // Défense en profondeur : au-delà du handler gardé, le contrôle est `disabled`.
    const outbox = readSource("app/(dashboard)/outbox/_components/OutboxBoard.tsx");
    const approvals = readSource("app/(dashboard)/approvals/_components/ApprovalsInbox.tsx");
    const card = readSource("app/(dashboard)/agents/_components/AgentCard.tsx");
    const tracker = readSource("app/(dashboard)/agents/_components/RunTracker.tsx");

    expect(outbox).toMatch(/disabled=\{busy \|\| !sendable \|\| tourActive\}/); // Envoyer / Réessayer
    expect(outbox).toMatch(/disabled=\{busy \|\| tourActive\}/); // Valider / Annuler
    expect(approvals).toMatch(/disabled=\{busy !== null \|\| tourActive\}/); // Approuver / Rejeter
    expect(card).toMatch(/disabled=\{launching \|\| tourActive\}/); // Lancer
    expect(tracker).toMatch(/disabled=\{busy !== null \|\| tourActive\}/); // HITL
  });
});
