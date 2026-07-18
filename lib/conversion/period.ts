// lib/conversion/period.ts — Fenêtres de segmentation temporelle (PUR).
//
// Calcule les bornes ISO d'un mois ou trimestre glissant, sans dépendance runtime.

import type { PeriodGrain } from "./types";

/** Nombre de périodes à remonter (0 = période courante). Borné côté appelant. */
export type PeriodWindow = { grain: PeriodGrain; offset: number };

/**
 * Retourne la fenêtre [from, to[ ISO pour un grain + offset donné, relative à
 * une date de référence (par défaut maintenant). offset=0 → période courante,
 * offset=1 → période précédente, etc.
 */
export function periodBounds(win: PeriodWindow, now = new Date()): { from: string; to: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0..11

  if (win.grain === "month") {
    const start = new Date(Date.UTC(y, m - win.offset, 1));
    const end = new Date(Date.UTC(y, m - win.offset + 1, 1));
    return { from: start.toISOString(), to: end.toISOString() };
  }

  // Trimestre : mois de début du trimestre courant = floor(m/3)*3.
  const qStartMonth = Math.floor(m / 3) * 3;
  const start = new Date(Date.UTC(y, qStartMonth - win.offset * 3, 1));
  const end = new Date(Date.UTC(y, qStartMonth - win.offset * 3 + 3, 1));
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Libellé humain court de la fenêtre (fr). */
export function periodLabel(win: PeriodWindow, now = new Date()): string {
  const { from } = periodBounds(win, now);
  const d = new Date(from);
  if (win.grain === "month") {
    return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `T${q} ${d.getUTCFullYear()}`;
}
