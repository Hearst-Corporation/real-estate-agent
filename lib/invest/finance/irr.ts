/**
 * TRI / IRR — calcul du taux de rendement interne ANNUALISÉ.
 *
 * Étude P8 (graphs 5, 6, 7) : « TRI = taux annualisant flux entrants/sortants ».
 *
 * Implémentation = XIRR daté (flux à dates quelconques), résolu par :
 *   1. Newton-Raphson (convergence quadratique, rapide).
 *   2. Fallback BISSECTION (robuste, garantie de convergence si la VAN change
 *      de signe sur l'intervalle de recherche).
 *
 * Définition. On cherche le taux annuel `r` tel que la VAN soit nulle :
 *
 *     NPV(r) = Σ_i  CF_i / (1 + r) ^ t_i      avec t_i en ANNÉES depuis t0
 *
 * où t0 = date du premier flux. Le facteur d'actualisation utilise (1+r)^t,
 * convention "annual compounding" cohérente avec un TRI annuel affiché.
 *
 * AUCUN IO. 100 % déterministe.
 */

import type { CashFlow, IrrResult, DayCountConvention } from './types';
import { yearFraction } from './dates';

/** Tolérance sur |NPV| pour considérer le zéro atteint (en euros). */
const NPV_TOL = 1e-6;
/** Tolérance sur le pas de taux pour Newton. */
const RATE_TOL = 1e-9;
const NEWTON_MAX_ITER = 100;
const BISECTION_MAX_ITER = 200;

/** Borne basse de recherche du taux (>-100 % strict pour éviter division /0). */
const RATE_MIN = -0.999_999;
/** Borne haute (1000 %/an : couvre des deals très courts à fort multiple). */
const RATE_MAX = 10;

interface DiscountedFlow {
  /** Temps en années depuis t0. */
  t: number;
  /** Montant signé. */
  cf: number;
}

/** Prépare les flux : tri par date, calcul des t_i en années depuis t0. */
function prepare(
  flows: CashFlow[],
  convention: DayCountConvention,
): DiscountedFlow[] {
  if (flows.length < 2) return [];
  const sorted = [...flows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const t0 = sorted[0].date;
  return sorted.map((f) => ({
    t: yearFraction(t0, f.date, convention),
    cf: f.montant_eur,
  }));
}

/** VAN au taux r. */
function npv(flows: DiscountedFlow[], r: number): number {
  let acc = 0;
  for (const { t, cf } of flows) acc += cf / Math.pow(1 + r, t);
  return acc;
}

/** Dérivée d(NPV)/dr — pour Newton. */
function dnpv(flows: DiscountedFlow[], r: number): number {
  let acc = 0;
  for (const { t, cf } of flows) {
    if (t === 0) continue; // dérivée d'une constante = 0
    acc += (-t * cf) / Math.pow(1 + r, t + 1);
  }
  return acc;
}

/**
 * Vérifie qu'au moins un flux est positif ET un négatif. Sinon aucune racine
 * économiquement sensée (pas de TRI défini).
 */
function hasSignChange(flows: DiscountedFlow[]): boolean {
  let pos = false;
  let neg = false;
  for (const { cf } of flows) {
    if (cf > 0) pos = true;
    else if (cf < 0) neg = true;
    if (pos && neg) return true;
  }
  return false;
}

/** Newton-Raphson borné. Retourne null si divergence / sort des bornes. */
function newton(
  flows: DiscountedFlow[],
  guess: number,
): { rate: number; iterations: number } | null {
  let r = guess;
  for (let i = 1; i <= NEWTON_MAX_ITER; i++) {
    const f = npv(flows, r);
    if (Math.abs(f) < NPV_TOL) return { rate: r, iterations: i };
    const df = dnpv(flows, r);
    if (df === 0 || !Number.isFinite(df)) return null; // plateau → bascule bissection
    const step = f / df;
    let next = r - step;
    // Clamp dans les bornes admissibles.
    if (next <= RATE_MIN) next = (RATE_MIN + r) / 2;
    if (next >= RATE_MAX) next = (RATE_MAX + r) / 2;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - r) < RATE_TOL) {
      r = next;
      return { rate: r, iterations: i };
    }
    r = next;
  }
  return null;
}

/**
 * Bissection sur [RATE_MIN, RATE_MAX]. Robuste : converge si la VAN change de
 * signe sur l'intervalle. Retourne null si pas de changement de signe.
 */
function bisection(
  flows: DiscountedFlow[],
): { rate: number; iterations: number } | null {
  let lo = RATE_MIN;
  let hi = RATE_MAX;
  let flo = npv(flows, lo);
  let fhi = npv(flows, hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return null;
  if (flo === 0) return { rate: lo, iterations: 0 };
  if (fhi === 0) return { rate: hi, iterations: 0 };
  if (flo * fhi > 0) return null; // pas d'encadrement de racine

  for (let i = 1; i <= BISECTION_MAX_ITER; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(flows, mid);
    if (Math.abs(fmid) < NPV_TOL || (hi - lo) / 2 < RATE_TOL) {
      return { rate: mid, iterations: i };
    }
    if (flo * fmid < 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return { rate: (lo + hi) / 2, iterations: BISECTION_MAX_ITER };
}

/**
 * Calcule le TRI annualisé (XIRR) d'une série de flux datés.
 *
 * Stratégie : Newton (guess 10 %) → si échec, Newton (guess 0 %) → si échec,
 * BISSECTION. La bissection garantit la racine quand il y a un changement de
 * signe de la VAN, ce qui est le cas standard d'un investissement
 * (décaissement initial négatif suivi d'encaissements positifs).
 *
 * @param flows  Au moins 2 flux, dont un positif et un négatif.
 * @param convention  Day count (défaut ACT_365).
 */
export function computeIrr(
  flows: CashFlow[],
  convention: DayCountConvention = 'ACT_365',
): IrrResult {
  const prepared = prepare(flows, convention);

  if (prepared.length < 2 || !hasSignChange(prepared)) {
    return {
      irr: null,
      methode: 'aucune',
      iterations: 0,
      npv_residuel: Number.POSITIVE_INFINITY,
      converge: false,
    };
  }

  // 1) Newton avec deux amorces différentes.
  for (const guess of [0.1, 0, -0.5, 0.5]) {
    const res = newton(prepared, guess);
    if (res && res.rate > RATE_MIN && res.rate < RATE_MAX) {
      const resid = Math.abs(npv(prepared, res.rate));
      if (resid < NPV_TOL) {
        return {
          irr: res.rate,
          methode: 'newton',
          iterations: res.iterations,
          npv_residuel: resid,
          converge: true,
        };
      }
    }
  }

  // 2) Fallback bissection.
  const bi = bisection(prepared);
  if (bi) {
    const resid = Math.abs(npv(prepared, bi.rate));
    return {
      irr: bi.rate,
      methode: 'bisection',
      iterations: bi.iterations,
      npv_residuel: resid,
      converge: resid < NPV_TOL,
    };
  }

  return {
    irr: null,
    methode: 'aucune',
    iterations: 0,
    npv_residuel: Number.POSITIVE_INFINITY,
    converge: false,
  };
}

/**
 * Valeur Actuelle Nette d'une série de flux datés à un taux d'actualisation
 * annuel donné. Utile pour les tests et l'affichage.
 */
export function npvAtRate(
  flows: CashFlow[],
  rate: number,
  convention: DayCountConvention = 'ACT_365',
): number {
  return npv(prepare(flows, convention), rate);
}

/**
 * Rendement TOTAL simple (non annualisé) d'un investissement à flux unique
 * d'entrée puis perceptions : (Σ encaissements) / (Σ |décaissements|) - 1.
 * Robustesse : retourne null si aucun décaissement.
 */
export function rendementTotalSimple(flows: CashFlow[]): number | null {
  let entrees = 0; // positifs
  let sorties = 0; // |négatifs|
  for (const f of flows) {
    if (f.montant_eur > 0) entrees += f.montant_eur;
    else sorties += -f.montant_eur;
  }
  if (sorties === 0) return null;
  return entrees / sorties - 1;
}
