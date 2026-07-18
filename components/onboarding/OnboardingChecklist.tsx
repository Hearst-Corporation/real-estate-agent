"use client";

/**
 * Checklist de démarrage (REA-ONBOARDING-011, LOT 6).
 * =================================================================
 *
 * COMPLÉTION DÉRIVÉE DES DONNÉES RÉELLES, jamais d'une case cochée à la main :
 * six items viennent de comptages owner-scopés sur GPU1
 * (`GET /api/onboarding/checklist`), le septième — « consulter le Centre
 * d'actions » — se dérive de la progression du tour socle.
 *
 * LOT 10 — SÉCURITÉ : ce composant ne fait qu'un `GET`. Il ne crée aucun client,
 * aucun bien, aucune estimation, n'approuve rien et n'envoie rien. Il OBSERVE.
 *
 * NON INTRUSIF (REA-UX-012) :
 *   - plus de dock flottant : la checklist vit UNIQUEMENT dans le panneau d'aide
 *     (section « Prise en main », repliable), atteint par l'entrée « Aide » de la
 *     navigation ; sa progression est rappelée en tête du panneau ;
 *   - état inconnu (session/DB/réseau) → on n'affiche RIEN plutôt qu'une
 *     checklist vierge inventée.
 */

import { useEffect, useState } from "react";
import { fetchChecklist } from "@/lib/onboarding/checklist-client";
import {
  ACTION_CENTER_TOUR_KEY,
  mergeLocalActionCenter,
  summarize,
  type ChecklistItem,
  type ChecklistSummary,
} from "@/lib/onboarding/checklist";
import { UI } from "@/lib/ui-strings";
import { useProductTour } from "./ProductTourProvider";

/* ------------------------------------------------------------------ */
/* Chargement                                                           */
/* ------------------------------------------------------------------ */

/**
 * Charge la checklist et réconcilie l'item « Centre d'actions » avec la
 * progression LOCALE du tour socle : la table de progression peut ne pas être
 * déployée, mais le navigateur, lui, sait que la visite a été terminée.
 * Réconciliation à sens unique — le local confirme un « fait », il ne rétrograde
 * jamais un item déjà connu comme fait côté serveur.
 */
function useChecklist(): { summary: ChecklistSummary | null; loading: boolean } {
  const { statusOf } = useProductTour();
  const [summary, setSummary] = useState<ChecklistSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const coreStatus = statusOf(ACTION_CENTER_TOUR_KEY);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetchChecklist(controller.signal).then((res) => {
      if (cancelled) return;
      setSummary(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (!summary) return { summary: null, loading };

  const localCompleted = coreStatus === "completed";
  const merged = summary.items.map((item): ChecklistItem =>
    item.id === "action-center" ? mergeLocalActionCenter(item, localCompleted) : item,
  );
  return { summary: summarize(merged), loading };
}

/**
 * Résumé seul (progression + items), pour les consommateurs qui n'ont pas besoin
 * de l'état de chargement — ex. le panneau d'aide, qui affiche « n sur 7 ».
 */
export function useChecklistSummary(): ChecklistSummary | null {
  return useChecklist().summary;
}

/* ------------------------------------------------------------------ */
/* Liste                                                                */
/* ------------------------------------------------------------------ */

const MARKER_BASE =
  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold";
const MARKER_BY_STATE: Record<ChecklistItem["state"], string> = {
  done: "border-accent-500 bg-accent-500/15 text-accent-700",
  todo: "border-zinc-950/15 text-zinc-400",
  // Indéterminé : ni coché ni vide — visuellement distinct du « à faire ».
  unknown: "border-dashed border-zinc-950/25 text-zinc-400",
};

function stateLabel(state: ChecklistItem["state"]): string {
  const t = UI.onboarding.checklist;
  if (state === "done") return t.done;
  if (state === "unknown") return t.unknown;
  return t.todo;
}

/** Liste seule — réutilisée par le dock ET par le panneau d'aide. */
export function ChecklistList({ summary }: { summary: ChecklistSummary }) {
  const t = UI.onboarding.checklist;

  return (
    <ul className="flex flex-col gap-3">
      {summary.items.map((item) => {
        const copy = t.items[item.id];
        const unknown = item.state === "unknown";
        return (
          <li key={item.id} className="flex items-start gap-3">
            <span className={`${MARKER_BASE} ${MARKER_BY_STATE[item.state]}`} aria-hidden="true">
              {item.state === "done" ? "✓" : ""}
            </span>
            <div className="min-w-0">
              <p
                className={`text-sm/5 ${
                  item.state === "done" ? "text-zinc-500 line-through" : "text-zinc-900"
                }`}
              >
                {copy?.label ?? item.id}
              </p>
              <p className="mt-0.5 text-xs/5 text-zinc-500">
                {unknown ? t.unknownHint : (copy?.hint ?? "")}
              </p>
              <span className="sr-only">{stateLabel(item.state)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Contenu complet (titre + progression + liste), tel qu'affiché dans le panneau
 * d'aide. Rend `null` tant que l'état réel n'est pas connu : on n'invente pas.
 */
export function OnboardingChecklistPanel() {
  const t = UI.onboarding.checklist;
  const { summary } = useChecklist();
  if (!summary) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-900">{t.title}</p>
        <p className="text-xs tabular-nums text-zinc-500">
          {t.progress(summary.done, summary.total)}
        </p>
      </div>
      <p className="mt-1 text-xs/5 text-zinc-500">
        {summary.completed ? t.completedBody : t.description}
      </p>
      <div className="mt-4">
        <ChecklistList summary={summary} />
      </div>
    </div>
  );
}

/* Le dock flottant a été retiré (REA-UX-012, LOT 1) : la checklist n'est plus une
   surface posée sur le contenu. Elle vit désormais UNIQUEMENT dans le panneau
   d'aide (section « Prise en main », repliable), atteint par l'entrée « Aide »
   de la navigation. La progression reste visible en tête du panneau. */
