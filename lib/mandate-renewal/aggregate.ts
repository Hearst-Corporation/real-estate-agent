/**
 * lib/mandate-renewal/aggregate.ts — Analyse PURE d'un mandat proche de l'expiration.
 * =================================================================================
 *
 * Aucune I/O ici : on reçoit des lignes DB brutes (mandat, visites, CR de visite,
 * estimations du bien) et on calcule :
 *   1. un RÉSUMÉ factuel (activité, retours/objections, évolution marché) ;
 *   2. une PROPOSITION de prochaine action, DÉTERMINISTE et EXPLICABLE
 *      (renouveler / ajuster le prix / changer de stratégie), avec les raisons.
 *
 * Aucun chiffre inventé : chaque valeur vient des lignes fournies. Une section
 * sans donnée rend un état honnête (empty / null). Le score de la proposition
 * n'existe pas — on renvoie une recommandation motivée par des règles nommées.
 */

import {
  RENEWAL_PRICE_GAP_RATIO,
  RENEWAL_STALE_VISITS_THRESHOLD,
} from "@/config/mandate-renewal";

// ─── Entrées attendues (sous-ensembles des Row DB réelles) ─────────────────────

export interface MandateInput {
  id: string;
  reference: string | null;
  kind: string;
  status: string;
  property_id: string | null;
  asking_price: number | null;
  signed_at: string | null;
  expires_at: string | null;
}

export interface VisitInput {
  id: string;
  status: string;
  scheduled_at: string | null;
  feedback: string | null;
  notes: string | null;
  created_at: string;
}

/** Compte-rendu structuré (table visit_reports, migration 0051). Optionnel. */
export interface VisitReportInput {
  visit_id: string;
  interest: string;
  outcome: string;
  positives: string | null;
  objections: string | null;
  price_discussed: number | null;
  reported_at: string;
}

/** Estimation du bien (table estimations). market_value/recommended_price + date. */
export interface EstimationInput {
  id: string;
  market_value: number | null;
  recommended_price: number | null;
  valued_at: string | null;
  created_at: string;
}

// ─── Sortie : résumé ───────────────────────────────────────────────────────────

export interface ActivitySummary {
  visitsTotal: number;
  visitsDone: number;
  visitsUpcoming: number;
  lastVisitAt: string | null;
  empty: boolean;
}

export interface FeedbackObjection {
  visitId: string;
  at: string;
  text: string;
}

export interface FeedbackSummary {
  /** false = aucun retour exploitable (ni CR structuré ni texte libre). */
  available: boolean;
  /** Nb de CR indiquant un intérêt fort (très intéressé / offre probable). */
  positiveSignals: number;
  /** Objections collectées (CR structurés + texte libre des visites réalisées). */
  objections: FeedbackObjection[];
  /** Visites réalisées sans aucun retour saisi. */
  missingReports: number;
}

export interface MarketSummary {
  /** false = aucune estimation exploitable pour ce bien. */
  available: boolean;
  askingPrice: number | null;
  /** Valeur de marché la plus récente (market_value ?? recommended_price). */
  latestMarketValue: number | null;
  latestValuedAt: string | null;
  /** Écart affiché vs marché en € (asking - market). Positif = sur-évalué. */
  gapEur: number | null;
  /** Écart relatif signé (gapEur / market). null si indéterminable. */
  gapRatio: number | null;
  /** Nombre d'estimations disponibles pour ce bien. */
  estimationCount: number;
}

// ─── Sortie : proposition ──────────────────────────────────────────────────────

export const RENEWAL_ACTIONS = ["renew", "adjust_price", "change_strategy"] as const;
export type RenewalAction = (typeof RENEWAL_ACTIONS)[number];

export const RENEWAL_ACTION_LABELS: Record<RenewalAction, string> = {
  renew: "Renouveler le mandat",
  adjust_price: "Ajuster le prix",
  change_strategy: "Changer de stratégie",
};

export interface RenewalProposal {
  action: RenewalAction;
  /** Raisons NOMMÉES et factuelles ayant conduit à la recommandation. */
  reasons: string[];
  /** Prix de marché suggéré si action = adjust_price (sinon null). */
  suggestedPrice: number | null;
}

export interface MandateRenewalAnalysis {
  mandateId: string;
  reference: string | null;
  kind: string;
  propertyId: string | null;
  daysUntilExpiry: number;
  expiresAt: string | null;
  activity: ActivitySummary;
  feedback: FeedbackSummary;
  market: MarketSummary;
  proposal: RenewalProposal;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const VISIT_DONE = "realisee";
const VISIT_UPCOMING = new Set(["planifiee", "confirmee"]);
const POSITIVE_INTEREST = new Set(["tres_interesse", "interesse"]);
const POSITIVE_OUTCOME = new Set(["offre_probable"]);

function parseTs(s: string | null | undefined): number {
  if (!s) return NaN;
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t;
}

/** Jours entiers restants avant `to` (négatif si dépassé). */
export function daysUntil(to: string | null | undefined, now: Date): number {
  const t = parseTs(to);
  if (Number.isNaN(t)) return 0;
  return Math.ceil((t - now.getTime()) / MS_PER_DAY);
}

function maxTs(candidates: (string | null | undefined)[]): string | null {
  let bestIso: string | null = null;
  let best = -Infinity;
  for (const c of candidates) {
    const t = parseTs(c);
    if (!Number.isNaN(t) && t > best) {
      best = t;
      bestIso = c as string;
    }
  }
  return bestIso;
}

// ─── Résumé : activité ─────────────────────────────────────────────────────────

export function summarizeActivity(visits: VisitInput[]): ActivitySummary {
  const visitsDone = visits.filter((v) => v.status === VISIT_DONE).length;
  const visitsUpcoming = visits.filter((v) => VISIT_UPCOMING.has(v.status)).length;
  const lastVisitAt = maxTs([
    ...visits.map((v) => v.scheduled_at),
    ...visits.map((v) => v.created_at),
  ]);
  return {
    visitsTotal: visits.length,
    visitsDone,
    visitsUpcoming,
    lastVisitAt,
    empty: visits.length === 0,
  };
}

// ─── Résumé : retours / objections ─────────────────────────────────────────────

export function summarizeFeedback(
  visits: VisitInput[],
  reports: VisitReportInput[],
): FeedbackSummary {
  const reportByVisit = new Map<string, VisitReportInput>();
  for (const r of reports) reportByVisit.set(r.visit_id, r);

  const done = visits.filter((v) => v.status === VISIT_DONE);
  const objections: FeedbackObjection[] = [];
  let positiveSignals = 0;
  let missingReports = 0;

  for (const v of done) {
    const at = v.scheduled_at ?? v.created_at;
    const report = reportByVisit.get(v.id);
    let hasSignal = false;

    if (report) {
      hasSignal = true;
      if (POSITIVE_INTEREST.has(report.interest) || POSITIVE_OUTCOME.has(report.outcome)) {
        positiveSignals += 1;
      }
      const obj = (report.objections ?? "").trim();
      if (obj) objections.push({ visitId: v.id, at, text: obj });
    } else {
      // Pas de CR structuré → on retombe sur le texte libre de la visite.
      const free = (v.feedback ?? v.notes ?? "").trim();
      if (free) {
        hasSignal = true;
        objections.push({ visitId: v.id, at, text: free });
      }
    }

    if (!hasSignal) missingReports += 1;
  }

  objections.sort((a, b) => parseTs(b.at) - parseTs(a.at));

  return {
    available: positiveSignals > 0 || objections.length > 0,
    positiveSignals,
    objections,
    missingReports,
  };
}

// ─── Résumé : évolution marché ─────────────────────────────────────────────────

/** Valeur de marché retenue pour une estimation : market_value sinon recommended_price. */
function estimationValue(e: EstimationInput): number | null {
  if (e.market_value != null && Number.isFinite(e.market_value)) return e.market_value;
  if (e.recommended_price != null && Number.isFinite(e.recommended_price)) {
    return e.recommended_price;
  }
  return null;
}

function estimationDate(e: EstimationInput): string {
  return e.valued_at ?? e.created_at;
}

export function summarizeMarket(
  askingPrice: number | null,
  estimations: EstimationInput[],
): MarketSummary {
  const usable = estimations
    .map((e) => ({ value: estimationValue(e), at: estimationDate(e) }))
    .filter((e): e is { value: number; at: string } => e.value != null);

  if (usable.length === 0) {
    return {
      available: false,
      askingPrice,
      latestMarketValue: null,
      latestValuedAt: null,
      gapEur: null,
      gapRatio: null,
      estimationCount: 0,
    };
  }

  usable.sort((a, b) => parseTs(b.at) - parseTs(a.at));
  const latest = usable[0];
  const asking =
    askingPrice != null && Number.isFinite(askingPrice) ? askingPrice : null;

  const gapEur = asking != null ? asking - latest.value : null;
  const gapRatio =
    gapEur != null && latest.value > 0 ? gapEur / latest.value : null;

  return {
    available: true,
    askingPrice: asking,
    latestMarketValue: latest.value,
    latestValuedAt: latest.at,
    gapEur,
    gapRatio,
    estimationCount: usable.length,
  };
}

// ─── Proposition DÉTERMINISTE ──────────────────────────────────────────────────

/**
 * Règles nommées, évaluées dans l'ordre. La PREMIÈRE qui s'applique fixe l'action.
 * Toutes les raisons pertinentes sont accumulées pour l'explicabilité.
 *
 *   R1 (adjust_price) : prix affiché sur-évalué de plus de RENEWAL_PRICE_GAP_RATIO
 *                       par rapport à la valeur de marché la plus récente.
 *   R2 (change_strategy) : beaucoup de visites réalisées (≥ seuil) mais AUCUN
 *                          signal positif → le produit ne convertit pas.
 *   R3 (renew) : par défaut — activité saine ou trop peu de recul pour changer.
 */
export function buildProposal(
  activity: ActivitySummary,
  feedback: FeedbackSummary,
  market: MarketSummary,
): RenewalProposal {
  const reasons: string[] = [];

  // Contexte factuel toujours consigné.
  reasons.push(
    `${activity.visitsDone} visite(s) réalisée(s), ${activity.visitsUpcoming} à venir.`,
  );

  const overpriced =
    market.available &&
    market.gapRatio != null &&
    market.gapRatio > RENEWAL_PRICE_GAP_RATIO;

  const stale =
    activity.visitsDone >= RENEWAL_STALE_VISITS_THRESHOLD &&
    feedback.positiveSignals === 0;

  if (market.available && market.gapRatio != null) {
    const pct = Math.round(market.gapRatio * 1000) / 10;
    reasons.push(
      `Prix affiché ${pct >= 0 ? "au-dessus" : "en-dessous"} du marché de ${Math.abs(pct)} % (marché : ${market.latestMarketValue} €).`,
    );
  }

  if (overpriced) {
    reasons.push(
      "Écart de prix significatif : un ajustement au marché relancera l'intérêt.",
    );
    return {
      action: "adjust_price",
      reasons,
      suggestedPrice: market.latestMarketValue,
    };
  }

  if (stale) {
    reasons.push(
      `${activity.visitsDone} visite(s) sans retour positif : le positionnement ou la diffusion doivent évoluer.`,
    );
    return { action: "change_strategy", reasons, suggestedPrice: null };
  }

  if (feedback.positiveSignals > 0) {
    reasons.push(
      `${feedback.positiveSignals} retour(s) positif(s) : le bien intéresse, prolonger la commercialisation.`,
    );
  } else if (activity.visitsDone < RENEWAL_STALE_VISITS_THRESHOLD) {
    reasons.push("Recul insuffisant pour changer de cap : reconduire le mandat.");
  }

  return { action: "renew", reasons, suggestedPrice: null };
}

// ─── Assemblage ────────────────────────────────────────────────────────────────

export function analyzeMandateRenewal(input: {
  mandate: MandateInput;
  visits: VisitInput[];
  reports: VisitReportInput[];
  estimations: EstimationInput[];
  now?: Date;
}): MandateRenewalAnalysis {
  const now = input.now ?? new Date();
  const activity = summarizeActivity(input.visits);
  const feedback = summarizeFeedback(input.visits, input.reports);
  const market = summarizeMarket(input.mandate.asking_price, input.estimations);
  const proposal = buildProposal(activity, feedback, market);

  return {
    mandateId: input.mandate.id,
    reference: input.mandate.reference,
    kind: input.mandate.kind,
    propertyId: input.mandate.property_id,
    daysUntilExpiry: daysUntil(input.mandate.expires_at, now),
    expiresAt: input.mandate.expires_at,
    activity,
    feedback,
    market,
    proposal,
  };
}
