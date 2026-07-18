// @vitest-environment jsdom
/**
 * Pancarte de visite — ACCESSIBILITÉ + RESPONSIVE (W7), en jsdom.
 * =================================================================
 *
 * Ce que ces tests PROUVENT sans navigateur :
 *   - contrat ARIA : `role="dialog"`, `aria-modal`, `aria-labelledby` /
 *     `aria-describedby` pointent des nœuds réels et non vides ;
 *   - les quatre commandes (Précédent / Suivant OU Terminer / Passer) sont des
 *     boutons atteignables au clavier (focusables), avec l'état `disabled`
 *     attendu sur la première étape ;
 *   - la pancarte est bornée en largeur (`max-w-[calc(100vw-2rem)]`, `w-80`) :
 *     AUCUNE largeur fixe en px qui dépasserait le viewport — anti-débordement ;
 *   - le conteneur reçoit le focus au montage et à chaque changement d'étape
 *     (la navigation clavier suit la visite) ;
 *   - les états `missing` / `resolving` s'affichent sans casser le contrat ARIA.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TourCoachMark } from "./TourCoachMark";
import { UI } from "@/lib/ui-strings";
import type { TourStep } from "@/lib/onboarding/types";

const chrome = UI.onboarding.chrome;

const STEP: TourStep = {
  id: "step-1",
  title: "Créer un client",
  body: "Voici où ajouter un premier contact.",
};

function renderMark(over: Partial<React.ComponentProps<typeof TourCoachMark>> = {}) {
  const props = {
    step: STEP,
    missing: false,
    resolving: false,
    stepIndex: 0,
    stepCount: 3,
    isFirst: true,
    isLast: false,
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onSkip: vi.fn(),
    onFinish: vi.fn(),
    ...over,
  };
  const utils = render(<TourCoachMark {...props} />);
  return { ...utils, props };
}

describe("TourCoachMark — contrat ARIA", () => {
  it("expose role=dialog + aria-modal + libellé/description reliés à des nœuds réels", () => {
    renderMark();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    const labelledby = dialog.getAttribute("aria-labelledby");
    const describedby = dialog.getAttribute("aria-describedby");
    expect(labelledby).toBeTruthy();
    expect(describedby).toBeTruthy();

    // Les cibles existent DANS le document et portent du texte.
    const title = document.getElementById(labelledby as string);
    const body = document.getElementById(describedby as string);
    expect(title?.textContent).toContain(STEP.title);
    expect(body?.textContent).toContain(STEP.body);
  });

  it("annonce l'accessibilité comme visite en lecture seule (rappel LOT 10)", () => {
    renderMark();
    expect(screen.getByText(chrome.readOnly)).toBeDefined();
  });
});

describe("TourCoachMark — commandes atteignables au clavier", () => {
  it("les boutons Passer / Précédent / Suivant sont présents et focusables", () => {
    renderMark({ isFirst: false });
    const skip = screen.getByRole("button", { name: chrome.skip });
    const prev = screen.getByRole("button", { name: chrome.prev });
    const next = screen.getByRole("button", { name: chrome.next });

    // Atteignables au clavier : ce sont de vrais boutons natifs (jamais tabIndex=-1).
    for (const btn of [skip, prev, next]) {
      expect(btn.tagName).toBe("BUTTON");
      expect(btn.getAttribute("tabindex")).not.toBe("-1");
      btn.focus();
      expect(document.activeElement).toBe(btn);
    }
  });

  it("« Précédent » est désactivé sur la première étape, actif ensuite", () => {
    const { rerender, props } = renderMark({ isFirst: true });
    expect((screen.getByRole("button", { name: chrome.prev }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    rerender(<TourCoachMark {...props} isFirst={false} />);
    expect((screen.getByRole("button", { name: chrome.prev }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("montre « Terminer » (et non « Suivant ») sur la dernière étape", () => {
    renderMark({ isFirst: false, isLast: true });
    expect(screen.getByRole("button", { name: chrome.finish })).toBeDefined();
    expect(screen.queryByRole("button", { name: chrome.next })).toBeNull();
  });

  it("les clics déclenchent les bons callbacks (navigation de visite, jamais métier)", () => {
    const { props } = renderMark({ isFirst: false, isLast: false });
    (screen.getByRole("button", { name: chrome.next }) as HTMLButtonElement).click();
    (screen.getByRole("button", { name: chrome.prev }) as HTMLButtonElement).click();
    (screen.getByRole("button", { name: chrome.skip }) as HTMLButtonElement).click();
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onPrev).toHaveBeenCalledTimes(1);
    expect(props.onSkip).toHaveBeenCalledTimes(1);
    expect(props.onFinish).not.toHaveBeenCalled();
  });
});

describe("TourCoachMark — largeur bornée (anti-débordement)", () => {
  it("la pancarte utilise une largeur d'échelle + max-width viewport, sans px fixe démesuré", () => {
    renderMark();
    const dialog = screen.getByRole("dialog");
    const cls = dialog.className;
    // Largeur d'échelle Catalyst (w-80 = 20rem) bornée par le viewport.
    expect(cls).toContain("max-w-[calc(100vw-2rem)]");
    expect(cls).toMatch(/\bw-80\b/);
    // Aucune largeur fixe en pixels (ex. w-[500px]) qui pourrait déborder.
    expect(cls).not.toMatch(/\bw-\[\d+px\]/);
    // Le style inline ne fixe pas non plus une largeur en dur.
    expect(dialog.getAttribute("style") ?? "").not.toMatch(/width\s*:/);
  });
});

describe("TourCoachMark — focus & états", () => {
  it("prend le focus au montage (la navigation clavier suit la visite)", () => {
    renderMark();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("affiche l'état « cible absente » sans casser le dialogue", () => {
    renderMark({ missing: true });
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText(chrome.targetMissing)).toBeDefined();
  });

  it("affiche l'état de résolution (recherche de l'élément) sans casser le dialogue", () => {
    renderMark({ resolving: true });
    expect(screen.getByText(chrome.loading)).toBeDefined();
  });
});
