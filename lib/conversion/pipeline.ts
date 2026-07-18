// lib/conversion/pipeline.ts — Calcul PUR du pipeline de conversion.
//
// Entrée : lignes DB réelles déjà filtrées (user+tenant+fenêtre) par fetch.ts.
// Sortie : funnel, délais médians, pertes — tous DÉRIVÉS, jamais inventés.
// Zéro I/O, zéro dépendance runtime → testable sur fixtures.

import type {
  ConversionReport,
  ConversionSources,
  FunnelStage,
  PeriodGrain,
  SegmentKind,
  StageDelay,
  StageId,
  StageLoss,
} from "./types";

// L'échelle ordonnée des statuts de lead (miroir de LEAD_STATUSES, CHECK DB).
// L'index dans cette échelle = la profondeur atteinte dans le pipeline.
const STATUS_ORDER = [
  "nouveau",
  "contacte",
  "qualifie",
  "visite",
  "offre",
  "gagne",
] as const;
const LOST_STATUS = "perdu";

/** Profondeur d'un lead dans le pipeline (0..5). -1 si perdu, -2 si inconnu. */
export function statusRank(status: string): number {
  if (status === LOST_STATUS) return -1;
  const i = (STATUS_ORDER as readonly string[]).indexOf(status);
  return i === -1 ? -2 : i;
}

// Mapping étage funnel → rang minimal de statut atteint.
// Un lead "compte" pour un étage s'il a atteint AU MOINS ce rang (funnel cumulatif).
const STAGE_MIN_RANK: Record<StageId, number> = {
  prospect: 0, // nouveau
  qualified: 2, // qualifie
  engaged: 3, // visite (renforcé par estimation/visite réelle)
  proposal: 4, // offre
  won: 5, // gagne
};

const STAGE_ORDER: StageId[] = ["prospect", "qualified", "engaged", "proposal", "won"];

/** Construit le href de navigation vers la liste filtrée réelle d'un étage. */
function stageHref(stage: StageId, segment: SegmentKind): string {
  const params = new URLSearchParams();
  // Chaque étage cible un sous-ensemble de statuts leads pour la liste filtrée.
  const STAGE_STATUSES: Record<StageId, string[]> = {
    prospect: ["nouveau", "contacte", "qualifie", "visite", "offre", "gagne"],
    qualified: ["qualifie", "visite", "offre", "gagne"],
    engaged: ["visite", "offre", "gagne"],
    proposal: ["offre", "gagne"],
    won: ["gagne"],
  };
  params.set("stage", stage);
  params.set("status", STAGE_STATUSES[stage].join(","));
  if (segment !== "all") params.set("kind", segment);
  return `/leads?${params.toString()}`;
}

/** Médiane d'une liste de nombres. null si vide. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Écart en jours entre deux dates ISO (>= 0, arrondi). */
function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Calcule le funnel cumulatif : à chaque étage, le nombre de leads du segment
 * ayant atteint au moins ce rang. Les estimations/visites réelles servent à
 * NE PAS sous-compter l'engagement (un lead avec une visite réalisée compte
 * comme "engaged" même si son statut est resté en retard).
 */
function computeStages(
  sources: ConversionSources,
  segment: SegmentKind,
): { stages: FunnelStage[]; totalLeads: number } {
  const leads = sources.leads.filter(
    (l) => segment === "all" || l.kind === segment,
  );
  const leadIds = new Set(leads.map((l) => l.id));

  // Ensemble des leads avec un signal d'engagement réel (visite réalisée ou
  // estimation existante rattachée). Ne relève JAMAIS un lead perdu.
  const engagedLeadIds = new Set<string>();
  for (const v of sources.visits) {
    if (v.lead_id && leadIds.has(v.lead_id) && v.status === "realisee") {
      engagedLeadIds.add(v.lead_id);
    }
  }
  for (const e of sources.estimations) {
    if (e.owner_lead_id && leadIds.has(e.owner_lead_id)) {
      engagedLeadIds.add(e.owner_lead_id);
    }
  }

  const totalLeads = leads.length;

  const rankOf = (leadId: string, status: string): number => {
    let rank = statusRank(status);
    // Renfort d'engagement : un signal réel garantit le rang "engaged" (3),
    // sans jamais rétrograder un lead plus avancé ni relever un lead perdu.
    if (rank >= 0 && engagedLeadIds.has(leadId)) rank = Math.max(rank, STAGE_MIN_RANK.engaged);
    return rank;
  };

  const stages: FunnelStage[] = STAGE_ORDER.map((id) => {
    const minRank = STAGE_MIN_RANK[id];
    const count = leads.reduce(
      (n, l) => (rankOf(l.id, l.status) >= minRank ? n + 1 : n),
      0,
    );
    return { id, count, stepRate: null, cumulativeRate: 0, href: stageHref(id, segment) };
  });

  // Taux de passage (par rapport à l'étage précédent) + cumulatif (depuis le sommet).
  const top = stages[0]?.count ?? 0;
  for (let i = 0; i < stages.length; i++) {
    stages[i].cumulativeRate = top > 0 ? stages[i].count / top : 0;
    if (i > 0) {
      const prev = stages[i - 1].count;
      stages[i].stepRate = prev > 0 ? stages[i].count / prev : 0;
    }
  }

  return { stages, totalLeads };
}

/**
 * Délais médians de passage. Faute d'historique d'événements par statut, on
 * mesure les proxys réels et honnêtes disponibles :
 *   - prospect→engagé : lead.created_at → 1re visite réalisée / estimation créée.
 *   - engagé→gagné    : lead.created_at → lead.updated_at pour les leads gagnés.
 * Chaque délai indique son échantillon (sample) : jamais présenté comme exact
 * s'il repose sur peu de paires.
 */
function computeDelays(sources: ConversionSources, segment: SegmentKind): StageDelay[] {
  const leads = sources.leads.filter((l) => segment === "all" || l.kind === segment);
  const leadById = new Map(leads.map((l) => [l.id, l]));

  // 1re trace d'engagement réelle par lead (min des dates visite réalisée / estimation).
  const firstEngage = new Map<string, string>();
  const consider = (leadId: string | null, iso: string) => {
    if (!leadId || !leadById.has(leadId)) return;
    const cur = firstEngage.get(leadId);
    if (!cur || new Date(iso).getTime() < new Date(cur).getTime()) firstEngage.set(leadId, iso);
  };
  for (const v of sources.visits) if (v.status === "realisee") consider(v.lead_id, v.scheduled_at);
  for (const e of sources.estimations) consider(e.owner_lead_id, e.created_at);

  const toEngage: number[] = [];
  for (const [leadId, iso] of firstEngage) {
    const l = leadById.get(leadId);
    if (l) toEngage.push(daysBetween(l.created_at, iso));
  }

  const toWon: number[] = [];
  for (const l of leads) {
    if (l.status === "gagne") toWon.push(daysBetween(l.created_at, l.updated_at));
  }

  return [
    { fromStatus: "nouveau", toStatus: "engage", medianDays: median(toEngage), sample: toEngage.length },
    { fromStatus: "engage", toStatus: "gagne", medianDays: median(toWon), sample: toWon.length },
  ];
}

/**
 * Pertes par étage : chaque lead perdu est rattaché au dernier étage qu'il avait
 * atteint AVANT d'être marqué perdu. Comme le statut "perdu" écrase le rang,
 * on approxime l'étage de perte par le rang le plus avancé cohérent avec ses
 * signaux réels (engagement). Honnête : un lead perdu sans signal reste "prospect".
 */
function computeLosses(sources: ConversionSources, segment: SegmentKind): StageLoss[] {
  const leads = sources.leads.filter((l) => segment === "all" || l.kind === segment);
  const lost = leads.filter((l) => l.status === LOST_STATUS);

  const engagedLeadIds = new Set<string>();
  for (const v of sources.visits) if (v.lead_id && v.status === "realisee") engagedLeadIds.add(v.lead_id);
  for (const e of sources.estimations) if (e.owner_lead_id) engagedLeadIds.add(e.owner_lead_id);

  // Étage de perte : engaged si signal réel, sinon prospect (approche prudente
  // — on ne prétend pas savoir plus que ce que la donnée montre).
  const byStage: Record<StageId, number> = {
    prospect: 0,
    qualified: 0,
    engaged: 0,
    proposal: 0,
    won: 0,
  };
  for (const l of lost) {
    if (engagedLeadIds.has(l.id)) byStage.engaged += 1;
    else byStage.prospect += 1;
  }

  const total = lost.length;
  return STAGE_ORDER.filter((s) => s !== "won").map((stage) => ({
    stage,
    lost: byStage[stage],
    share: total > 0 ? byStage[stage] / total : 0,
  }));
}

/** Point d'entrée : assemble le rapport complet à partir des sources réelles. */
export function computeConversion(
  sources: ConversionSources,
  opts: { segment: SegmentKind; grain: PeriodGrain; from: string; to: string },
): ConversionReport {
  const { stages, totalLeads } = computeStages(sources, opts.segment);
  const delays = computeDelays(sources, opts.segment);
  const losses = computeLosses(sources, opts.segment);

  const won = stages.find((s) => s.id === "won")?.count ?? 0;
  const lostCount = sources.leads.filter(
    (l) => (opts.segment === "all" || l.kind === opts.segment) && l.status === LOST_STATUS,
  ).length;

  return {
    segment: opts.segment,
    grain: opts.grain,
    from: opts.from,
    to: opts.to,
    totalLeads,
    stages,
    delays,
    losses,
    winRate: totalLeads > 0 ? won / totalLeads : 0,
    lossRate: totalLeads > 0 ? lostCount / totalLeads : 0,
  };
}
