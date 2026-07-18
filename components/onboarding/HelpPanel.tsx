"use client";

/**
 * Panneau « Aide et visites guidées » (REA-ONBOARDING-011, LOT 7 ; REA-UX-012, LOT 1).
 * =================================================================
 *
 * SEUL point d'accès à l'aide, ouvert depuis l'entrée « Aide » de la navigation
 * (rail desktop + barre mobile). Plus aucun dock flottant au-dessus du contenu.
 *
 * Ordre imposé (REA-UX-012) :
 *   1. en-tête « Aide et visites guidées » ;
 *   2. progression « Prise en main — n sur 7 » ;
 *   3. action contextuelle « Découvrir cette page » (route-aware) ;
 *   4. checklist de démarrage, repliable ;
 *   5. liste des autres visites ;
 *   6. états Reprendre / Rejouer / Indisponible.
 *
 * La logique route-aware autrefois portée par `PageTourButton` (rendu comme
 * commande globale) vit désormais ICI : `tourForPath` résout la visite de la
 * page courante et l'action est proposée dans la section « Cette page ». Sur une
 * page sans visite, on explique sobrement plutôt que d'afficher un bouton mort.
 *
 * LOT 10 — SÉCURITÉ : les seules écritures possibles depuis ce panneau
 * concernent la PROGRESSION DE VISITE (reset d'un tour). Aucune donnée métier
 * n'est touchée : ni client, ni bien, ni message, ni approbation, ni agent.
 */

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/cockpit/Icon";
import { resetTourProgress } from "@/lib/onboarding/progress-client";
import type { TourKey, TourStatus } from "@/lib/onboarding/types";
import { UI } from "@/lib/ui-strings";
import { AzigoWatermark } from "@/components/cockpit/AzigoWatermark";
import { useHelpPanel } from "./HelpPanelProvider";
import { OnboardingChecklistPanel, useChecklistSummary } from "./OnboardingChecklist";
import { tourForPath } from "./PageTourButton";
import { useProductTour } from "./ProductTourProvider";

/**
 * Les visites proposées, dans l'ordre d'apprentissage. Un slot non encore livré
 * par son worker s'affiche « bientôt disponible » — jamais un lanceur cassé.
 */
export const HELP_TOUR_ORDER: readonly TourKey[] = [
  "core-cockpit",
  "prospection",
  "crm",
  "estimations",
  "offmarket",
  "communications-hitl",
  "agents",
] as const;

function actionLabel(status: TourStatus): string {
  const t = UI.onboarding.help;
  if (status === "running") return t.resume;
  if (status === "completed" || status === "skipped") return t.replay;
  return t.start;
}

export function HelpPanel() {
  const t = UI.onboarding.help;
  const { open, closeHelp } = useHelpPanel();
  const pathname = usePathname();
  const { availableTours, startTour, resumeTour, statusOf } = useProductTour();
  const summary = useChecklistSummary();
  const [busyKey, setBusyKey] = useState<TourKey | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);

  /**
   * Rejouer une visite TERMINÉE : on efface d'abord la progression persistée
   * (route déjà livrée), puis on redémarre à l'étape 1. Si l'effacement serveur
   * échoue (table 0059 absente), la visite repart quand même localement — la
   * relance ne dépend pas de la persistance.
   */
  const launch = useCallback(
    async (key: TourKey, status: TourStatus) => {
      if (status === "running") {
        resumeTour(key);
        closeHelp();
        return;
      }
      setBusyKey(key);
      const def = availableTours.find((d) => d.key === key);
      try {
        await resetTourProgress({ tourKey: key, ...(def ? { tourVersion: def.version } : {}) });
      } finally {
        setBusyKey(null);
      }
      startTour(key);
      closeHelp();
    },
    [availableTours, closeHelp, resumeTour, startTour],
  );

  // ── Action contextuelle route-aware (ex-PageTourButton) ──
  const pageTourKey = tourForPath(pathname ?? "");
  const pageTourAvailable =
    pageTourKey != null && availableTours.some((d) => d.key === pageTourKey);
  const pageTourStatus = pageTourKey ? statusOf(pageTourKey) : "idle";
  const pageName = pageTourKey ? (t.entries[pageTourKey] ?? pageTourKey) : "";

  return (
    <Dialog open={open} onClose={closeHelp} size="lg">
      <div className="relative">
        <AzigoWatermark placement="panel" />

        <div className="relative">
          {/* 1. En-tête */}
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>

          <DialogBody>
            {/* 2. Progression « Prise en main — n sur 7 » */}
            {summary && (
              <div className="surface-inset flex items-center justify-between gap-4 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-accent-700"
                  >
                    <Icon name="help" className="size-4" />
                  </span>
                  <p className="text-sm font-medium text-zinc-900">
                    {UI.onboarding.checklist.title}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-zinc-900">
                  {UI.onboarding.checklist.progress(summary.done, summary.total)}
                </p>
              </div>
            )}

            {/* 3. Action contextuelle : « Découvrir cette page » */}
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {t.sectionContextual}
              </p>
              {pageTourKey && pageTourAvailable ? (
                <div className="mt-2">
                  <Button
                    color="accent"
                    onClick={() => void launch(pageTourKey, pageTourStatus)}
                    aria-label={t.pageTourAvailable(pageName)}
                  >
                    <Icon name="search" data-slot="icon" />
                    {t.pageTourAvailable(pageName)}
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-sm/6 text-zinc-500">{t.pageTourNone}</p>
              )}
            </div>

            {/* 4. Checklist de démarrage, repliable */}
            {summary && !summary.completed && (
              <div className="mt-6 border-t border-zinc-950/5 pt-5">
                <Button
                  plain
                  className="!px-0 !text-sm"
                  onClick={() => setChecklistOpen((o) => !o)}
                  aria-expanded={checklistOpen}
                  aria-label={checklistOpen ? t.checklistCollapse : t.checklistExpand}
                >
                  <Icon
                    name={checklistOpen ? "chevron-down" : "chevron-right"}
                    data-slot="icon"
                  />
                  {t.sectionChecklist}
                </Button>
                {checklistOpen && (
                  <div className="mt-3">
                    <OnboardingChecklistPanel />
                  </div>
                )}
              </div>
            )}
            {summary?.completed && (
              <div className="mt-6 border-t border-zinc-950/5 pt-5">
                <OnboardingChecklistPanel />
              </div>
            )}

            {/* 5 + 6. Liste des visites + états Reprendre / Rejouer / Indisponible */}
            <div className="mt-6 border-t border-zinc-950/5 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {t.sectionTours}
              </p>
              <ul className="mt-2 flex flex-col divide-y divide-zinc-950/5">
                {HELP_TOUR_ORDER.map((key) => {
                  const def = availableTours.find((d) => d.key === key) ?? null;
                  const status = statusOf(key);
                  const busy = busyKey === key;
                  return (
                    <li key={key} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900">{t.entries[key] ?? key}</p>
                        <p className="mt-0.5 text-xs/5 text-zinc-500">
                          {def ? def.description : t.unavailable}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-zinc-500">{t.status[status] ?? ""}</span>
                        <Button
                          outline
                          disabled={!def || busy}
                          onClick={() => void launch(key, status)}
                          aria-label={`${actionLabel(status)} — ${t.entries[key] ?? key}`}
                        >
                          <span className="text-xs">{busy ? t.resetting : actionLabel(status)}</span>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </DialogBody>

          <DialogActions>
            <Button plain onClick={closeHelp}>
              {t.close}
            </Button>
          </DialogActions>
        </div>
      </div>
    </Dialog>
  );
}
