"use client";

/**
 * Product tour — MOTEUR (REA-ONBOARDING-011, LOT 1).
 * =================================================================
 *
 * Provider route-aware monté dans app/(dashboard)/layout.tsx. Il orchestre :
 *   élément cible · découpe spotlight · position auto de la pancarte · scroll
 *   jusqu'à l'élément · changement de route · retour arrière · étape suivante ·
 *   passage de la visite · Échap · navigation clavier · redimensionnement ·
 *   changement d'orientation · éléments chargés en asynchrone (MutationObserver)
 *   · élément cible absent · reprise après rechargement.
 *
 * LOT 10 — SÉCURITÉ : ce moteur ne déclenche AUCUNE action métier.
 *   Il lit le DOM (querySelector, getBoundingClientRect), il ne le pilote pas :
 *   aucun `.click()`, aucun `.submit()`, aucun `fetch` métier, aucune écriture
 *   hors `localStorage` de progression. La seule navigation possible est un
 *   `router.push` vers la route DÉCLARÉE de l'étape. L'overlay avale les clics :
 *   la cible mise en évidence ne peut pas être activée par mégarde.
 *   `tourActive` permet en plus à un composant sensible de refuser toute
 *   activation pendant la visite.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  anchorWaitMs,
  clampIndex,
  completeProgress,
  isFirstStep,
  isLastStep,
  missingStrategy,
  nextProgress,
  parseProgress,
  prevProgress,
  goToProgress,
  resumeProgress,
  seekRenderableStep,
  serializeProgress,
  skipProgress,
  startProgress,
  statusFromStored,
  stepAt,
  storageKey,
} from "@/lib/onboarding/progress";
import { getTour, listTours } from "@/lib/onboarding/tours";
import type {
  TourContextValue,
  TourDefinition,
  TourKey,
  TourProgress,
  TourRect,
  TourStatus,
  TourStep,
} from "@/lib/onboarding/types";
import { TOUR_KEYS } from "@/lib/onboarding/types";
import { TourOverlay } from "./TourOverlay";

const TourContext = createContext<TourContextValue | null>(null);

/** Contexte de visite. Hors provider, renvoie un état inerte (jamais d'exception). */
export function useProductTour(): TourContextValue {
  return useContext(TourContext) ?? INERT_CONTEXT;
}

/**
 * Raccourci LOT 10 pour les composants sensibles :
 *   `const tourActive = useTourActive(); if (tourActive) return;`
 */
export function useTourActive(): boolean {
  return useProductTour().tourActive;
}

/* ------------------------------------------------------------------ */
/* Helpers DOM (lecture seule)                                          */
/* ------------------------------------------------------------------ */

/** Les ancres sont nos propres identifiants : alphanumérique, `-` et `_`. */
const SAFE_ANCHOR = /^[a-zA-Z0-9_-]+$/;

function findAnchor(anchor: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (!SAFE_ANCHOR.test(anchor)) return null;
  return document.querySelector<HTMLElement>(`[data-tour-id="${anchor}"]`);
}

function readRect(el: HTMLElement): TourRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Le focus est-il dans un champ de saisie ? (on n'y capture pas les flèches). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function readStored(key: TourKey): TourProgress | null {
  if (typeof window === "undefined") return null;
  try {
    return parseProgress(window.localStorage.getItem(storageKey(key)));
  } catch {
    return null; // stockage indisponible (mode privé, quota) → visite volatile
  }
}

function writeStored(progress: TourProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(progress.key), serializeProgress(progress));
  } catch {
    /* stockage indisponible : la visite fonctionne, seule la reprise est perdue */
  }
}

/* ------------------------------------------------------------------ */
/* Résolution de l'étape courante                                       */
/* ------------------------------------------------------------------ */

type Resolution =
  | { phase: "resolving" }
  /** `rect: null` + `missing: true` → explication centrée, interface non bloquée. */
  | { phase: "ready"; el: HTMLElement | null; rect: TourRect | null; missing: boolean };

const INERT_CONTEXT: TourContextValue = {
  tourActive: false,
  activeTour: null,
  activeStep: null,
  stepIndex: -1,
  stepCount: 0,
  isFirstStep: true,
  isLastStep: true,
  startTour: () => {},
  resumeTour: () => {},
  nextStep: () => {},
  prevStep: () => {},
  skipTour: () => {},
  finishTour: () => {},
  statusOf: () => "idle" as TourStatus,
  availableTours: [],
};

export function ProductTourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [progress, setProgress] = useState<TourProgress | null>(null);
  const [statuses, setStatuses] = useState<Partial<Record<TourKey, TourStatus>>>({});
  const [resolution, setResolution] = useState<Resolution>({ phase: "resolving" });

  /** Élément qui avait le focus avant l'ouverture — rendu à la fermeture (a11y). */
  const focusOrigin = useRef<HTMLElement | null>(null);

  const activeTour: TourDefinition | null = progress ? getTour(progress.key) : null;
  const running = Boolean(progress && progress.status === "running" && activeTour);
  const stepIndex = progress && activeTour ? clampIndex(activeTour, progress.stepIndex) : -1;
  const activeStep: TourStep | null =
    running && activeTour ? stepAt(activeTour, stepIndex) : null;

  /* ---------------- persistance ---------------- */

  const commit = useCallback((next: TourProgress) => {
    setProgress(next);
    setStatuses((prev) => ({ ...prev, [next.key]: next.status }));
    writeStored(next);
  }, []);

  /** Rend le focus à l'élément d'origine (a11y : retour au point de départ). */
  const restoreFocus = useCallback(() => {
    const origin = focusOrigin.current;
    focusOrigin.current = null;
    if (origin && origin.isConnected) origin.focus();
  }, []);

  /* ---------------- statuts connus + reprise après rechargement ---------------- */

  useEffect(() => {
    const known: Partial<Record<TourKey, TourStatus>> = {};
    let resumable: TourProgress | null = null;
    for (const key of TOUR_KEYS) {
      const def = getTour(key);
      if (!def) continue;
      const stored = readStored(key);
      known[key] = statusFromStored(def, stored);
      if (!resumable) {
        const candidate = resumeProgress(def, stored);
        if (candidate) resumable = candidate;
      }
    }
    setStatuses(known);
    if (resumable) {
      focusOrigin.current = null; // rechargement : pas d'origine de focus à rendre
      setProgress(resumable);
    }
  }, []);

  /* ---------------- commandes ---------------- */

  const startTour = useCallback(
    (key: TourKey) => {
      const def = getTour(key);
      if (!def || def.steps.length === 0) return;
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        focusOrigin.current = document.activeElement;
      }
      setResolution({ phase: "resolving" });
      commit(startProgress(def));
    },
    [commit],
  );

  const resumeTour = useCallback(
    (key: TourKey) => {
      const def = getTour(key);
      if (!def) return;
      const candidate = resumeProgress(def, readStored(key));
      if (!candidate) {
        startTour(key);
        return;
      }
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        focusOrigin.current = document.activeElement;
      }
      setResolution({ phase: "resolving" });
      commit(candidate);
    },
    [commit, startTour],
  );

  const nextStep = useCallback(() => {
    if (!progress || !activeTour) return;
    setResolution({ phase: "resolving" });
    const next = nextProgress(activeTour, progress);
    commit(next);
    if (next.status !== "running") restoreFocus();
  }, [activeTour, commit, progress, restoreFocus]);

  const prevStep = useCallback(() => {
    if (!progress || !activeTour) return;
    setResolution({ phase: "resolving" });
    commit(prevProgress(activeTour, progress));
  }, [activeTour, commit, progress]);

  const skipTour = useCallback(() => {
    if (!progress) return;
    commit(skipProgress(progress));
    restoreFocus();
  }, [commit, progress, restoreFocus]);

  const finishTour = useCallback(() => {
    if (!progress || !activeTour) return;
    commit(completeProgress(activeTour, progress));
    restoreFocus();
  }, [activeTour, commit, progress, restoreFocus]);

  /* ---------------- changement de route piloté par l'étape ---------------- */

  useEffect(() => {
    if (!running || !activeStep || !activeStep.route) return;
    if (pathname === activeStep.route) return;
    router.push(activeStep.route);
  }, [activeStep, pathname, router, running]);

  /* ---------------- résolution de l'ancre (async, absente, scroll) ---------------- */

  useEffect(() => {
    const current = progress;
    if (!running || !activeTour || !activeStep || !current) return;
    // On attend d'être sur la bonne route avant de chercher l'ancre.
    if (activeStep.route && pathname !== activeStep.route) {
      setResolution({ phase: "resolving" });
      return;
    }

    // Étape purement explicative : pas de cible, affichage centré immédiat.
    if (!activeStep.anchor) {
      setResolution({ phase: "ready", el: null, rect: null, missing: false });
      return;
    }

    const anchor = activeStep.anchor;
    let cancelled = false;

    const settle = (el: HTMLElement) => {
      if (cancelled) return;
      // Scroll jusqu'à l'élément — LECTURE de position, aucune activation.
      el.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
      setResolution({ phase: "ready", el, rect: readRect(el), missing: false });
    };

    /** Cible introuvable après attente : on saute ou on centre. Jamais de blocage. */
    const giveUp = () => {
      if (cancelled) return;
      if (missingStrategy(activeStep) === "skip") {
        const target = seekRenderableStep(
          activeTour,
          stepIndex + 1,
          1,
          (a) => findAnchor(a) !== null,
        );
        if (target === null) {
          // Plus rien d'affichable : on termine proprement.
          commit(completeProgress(activeTour, { ...current, stepIndex }));
          restoreFocus();
          return;
        }
        commit(goToProgress(activeTour, current, target));
        return;
      }
      setResolution({ phase: "ready", el: null, rect: null, missing: true });
    };

    const immediate = findAnchor(anchor);
    if (immediate) {
      settle(immediate);
      return;
    }

    // Élément chargé en asynchrone : on observe le DOM jusqu'à l'échéance.
    setResolution({ phase: "resolving" });
    const observer = new MutationObserver(() => {
      const el = findAnchor(anchor);
      if (!el) return;
      observer.disconnect();
      window.clearTimeout(timer);
      settle(el);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const timer = window.setTimeout(() => {
      observer.disconnect();
      giveUp();
    }, anchorWaitMs(activeStep));

    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(timer);
    };
    // `progress` est volontairement hors deps : seules la clé, l'étape et la
    // route déclenchent une nouvelle résolution (sinon boucle de re-résolution).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, activeTour, activeStep, stepIndex, pathname]);

  /* ---------------- suivi du rectangle : resize, orientation, scroll ---------------- */

  const trackedEl = resolution.phase === "ready" ? resolution.el : null;

  useEffect(() => {
    if (!trackedEl) return;
    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!trackedEl.isConnected) {
          // La cible a disparu en cours d'étape → explication centrée, pas de blocage.
          setResolution({ phase: "ready", el: null, rect: null, missing: true });
          return;
        }
        setResolution({ phase: "ready", el: trackedEl, rect: readRect(trackedEl), missing: false });
      });
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(trackedEl);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [trackedEl]);

  /* ---------------- clavier : Échap ferme, flèches naviguent ---------------- */

  useEffect(() => {
    if (!running) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        skipTour();
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        nextStep();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        prevStep();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nextStep, prevStep, running, skipTour]);

  /* ---------------- drapeau global pour les composants non-React ---------------- */

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (running) root.dataset.tourActive = "true";
    else delete root.dataset.tourActive;
    return () => {
      delete root.dataset.tourActive;
    };
  }, [running]);

  /* ---------------- contexte ---------------- */

  const statusOf = useCallback(
    (key: TourKey): TourStatus => statuses[key] ?? "idle",
    [statuses],
  );

  const availableTours = useMemo(() => listTours(), []);

  const value = useMemo<TourContextValue>(
    () => ({
      tourActive: running,
      activeTour: running ? activeTour : null,
      activeStep,
      stepIndex: running ? stepIndex : -1,
      stepCount: activeTour ? activeTour.steps.length : 0,
      isFirstStep: isFirstStep(stepIndex),
      isLastStep: activeTour ? isLastStep(activeTour, stepIndex) : true,
      startTour,
      resumeTour,
      nextStep,
      prevStep,
      skipTour,
      finishTour,
      statusOf,
      availableTours,
    }),
    [
      activeStep,
      activeTour,
      availableTours,
      finishTour,
      nextStep,
      prevStep,
      resumeTour,
      running,
      skipTour,
      startTour,
      statusOf,
      stepIndex,
    ],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {running && activeTour && activeStep ? (
        <TourOverlay
          step={activeStep}
          rect={resolution.phase === "ready" ? resolution.rect : null}
          missing={resolution.phase === "ready" ? resolution.missing : false}
          resolving={resolution.phase === "resolving"}
          stepIndex={stepIndex}
          stepCount={activeTour.steps.length}
          isFirst={isFirstStep(stepIndex)}
          isLast={isLastStep(activeTour, stepIndex)}
          onNext={nextStep}
          onPrev={prevStep}
          onSkip={skipTour}
          onFinish={finishTour}
        />
      ) : null}
    </TourContext.Provider>
  );
}
