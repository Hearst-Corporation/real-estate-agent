/**
 * Utilitaires DATE — purs, sans dépendance, sans fuseau.
 *
 * On manipule des dates calendaires ISO `YYYY-MM-DD` en UTC pour éviter tout
 * effet de fuseau local (déterminisme des tests). La fraction d'année est
 * calculée en jours réels (ACT) pour rester cohérent avec un règlement EUR.
 */

import type { DayCountConvention } from './types';

const MS_PER_DAY = 86_400_000;

/** Parse une date ISO `YYYY-MM-DD` en epoch ms UTC (minuit). Strict. */
export function parseIsoDateUtc(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Date ISO invalide: "${iso}" (attendu YYYY-MM-DD)`);
  const [, y, mo, d] = m;
  const ts = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(ts)) throw new Error(`Date ISO invalide: "${iso}"`);
  return ts;
}

/** Sérialise un epoch ms UTC en `YYYY-MM-DD`. */
export function toIsoDateUtc(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Ajoute un nombre (entier) de MOIS calendaires à une date ISO (UTC). */
export function addMonthsIso(iso: string, months: number): string {
  const ts = parseIsoDateUtc(iso);
  const d = new Date(ts);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Garde-fou fin de mois (ex. 31 jan + 1 mois → 28/29 fév, pas 02-03).
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return toIsoDateUtc(d.getTime());
}

/** Nombre de jours entiers entre deux dates ISO (b - a). */
export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((parseIsoDateUtc(bIso) - parseIsoDateUtc(aIso)) / MS_PER_DAY);
}

/**
 * Fraction d'année entre deux dates selon la convention de day count.
 *  - ACT_365 : jours réels / 365   (défaut)
 *  - ACT_360 : jours réels / 360
 *  - 30_360  : convention bancaire 30/360 (mois de 30j, année de 360j)
 */
export function yearFraction(
  aIso: string,
  bIso: string,
  convention: DayCountConvention = 'ACT_365',
): number {
  if (convention === '30_360') {
    const a = new Date(parseIsoDateUtc(aIso));
    const b = new Date(parseIsoDateUtc(bIso));
    let d1 = a.getUTCDate();
    let d2 = b.getUTCDate();
    if (d1 === 31) d1 = 30;
    if (d2 === 31 && d1 === 30) d2 = 30;
    const days =
      360 * (b.getUTCFullYear() - a.getUTCFullYear()) +
      30 * (b.getUTCMonth() - a.getUTCMonth()) +
      (d2 - d1);
    return days / 360;
  }
  const days = daysBetween(aIso, bIso);
  return convention === 'ACT_360' ? days / 360 : days / 365;
}
