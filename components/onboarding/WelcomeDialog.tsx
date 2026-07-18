"use client";

/**
 * Écran d'accueil initial (REA-ONBOARDING-011, LOT 4).
 * =================================================================
 *
 * S'affiche au PREMIER accès authentifié SANS progression existante — ni
 * localement (aucune clé de visite en stockage) ni côté serveur (aucune ligne
 * de progression). Dès qu'une progression existe, l'écran ne réapparaît plus :
 * la reprise (gérée par le moteur) prend le relais.
 *
 * NE FORCE JAMAIS :
 *   - « Plus tard » referme et ne redemande plus (préférence locale) ;
 *   - aucune action métier n'est déclenchée, dans un cas comme dans l'autre ;
 *   - une visite quittée reprend à sa dernière étape (moteur, LOT 1) — rien
 *     n'oblige à la terminer.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchTourProgress } from "@/lib/onboarding/progress-client";
import { storageKey } from "@/lib/onboarding/progress";
import { TOUR_KEYS } from "@/lib/onboarding/types";
import { ACTION_CENTER_TOUR_KEY } from "@/lib/onboarding/checklist";
import { UI } from "@/lib/ui-strings";
import { useProductTour } from "./ProductTourProvider";

/** « L'accueil a déjà été montré » — préférence d'affichage, aucune donnée métier. */
const WELCOME_STORAGE_KEY = "azigo.onboarding.welcome.seen";

function markSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WELCOME_STORAGE_KEY, "1");
  } catch {
    /* stockage indisponible : l'accueil pourra réapparaître, jamais bloquer */
  }
}

function alreadySeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(WELCOME_STORAGE_KEY) === "1";
  } catch {
    return true; // dans le doute on n'affiche pas : mieux vaut muet qu'intrusif
  }
}

/**
 * Une visite a-t-elle déjà été entamée sur ce navigateur ? Lecture directe du
 * stockage (et non du contexte) pour ne pas dépendre de l'ordre de montage des
 * effets du provider.
 */
function hasLocalProgress(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return TOUR_KEYS.some((key) => window.localStorage.getItem(storageKey(key)) !== null);
  } catch {
    return true;
  }
}

export function WelcomeDialog() {
  const { startTour, tourActive } = useProductTour();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (alreadySeen() || hasLocalProgress()) return;
    let cancelled = false;
    // Progression serveur : une seule ligne suffit à prouver que l'utilisateur
    // a déjà commencé — on ne réaffiche alors pas l'accueil.
    fetchTourProgress().then((res) => {
      if (cancelled) return;
      if (res.entries.length > 0) return;
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    markSeen();
    setOpen(false);
  }, []);

  const begin = useCallback(() => {
    markSeen();
    setOpen(false);
    startTour(ACTION_CENTER_TOUR_KEY);
  }, [startTour]);

  const t = UI.onboarding.welcome;

  return (
    <Dialog open={open && !tourActive} onClose={dismiss} size="lg">
      <DialogTitle>{t.title}</DialogTitle>
      <DialogDescription>{t.promise}</DialogDescription>
      <DialogBody>
        <p className="text-sm/6 text-zinc-500">{t.note}</p>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={dismiss}>
          {t.later}
        </Button>
        <Button color="indigo" onClick={begin}>
          {t.start}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
