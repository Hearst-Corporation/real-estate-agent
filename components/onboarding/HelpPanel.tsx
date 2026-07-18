"use client";

/**
 * Panneau « Aide et visites guidées » (REA-ONBOARDING-011, LOT 7).
 * =================================================================
 *
 * Point d'accès PERMANENT aux visites : chaque visite est relançable
 * MANUELLEMENT, y compris quand elle est déjà terminée (« Rejouer » →
 * `POST /api/onboarding/reset` côté serveur, puis redémarrage local à l'étape 1).
 * Une visite interrompue se REPREND à sa dernière étape (« Reprendre »).
 *
 * Le panneau héberge aussi la checklist de démarrage : une fois terminée,
 * celle-ci ne s'impose plus à l'écran mais reste consultable ICI.
 *
 * LOT 10 — SÉCURITÉ : les seules écritures possibles depuis ce panneau
 * concernent la PROGRESSION DE VISITE (reset d'un tour). Aucune donnée métier
 * n'est touchée : ni client, ni bien, ni message, ni approbation, ni agent.
 */

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { resetTourProgress } from "@/lib/onboarding/progress-client";
import type { TourKey, TourStatus } from "@/lib/onboarding/types";
import { UI } from "@/lib/ui-strings";
import { OnboardingChecklistPanel } from "./OnboardingChecklist";
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

export function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = UI.onboarding.help;
  const { availableTours, startTour, resumeTour, statusOf } = useProductTour();
  const [busyKey, setBusyKey] = useState<TourKey | null>(null);

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
        onClose();
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
      onClose();
    },
    [availableTours, onClose, resumeTour, startTour],
  );

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>{t.title}</DialogTitle>
      <DialogDescription>{t.description}</DialogDescription>

      <DialogBody>
        <ul className="flex flex-col divide-y divide-zinc-950/5">
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

        <div className="mt-6 border-t border-zinc-950/5 pt-6">
          <OnboardingChecklistPanel />
        </div>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>
          {t.close}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
