/**
 * lib/assistant-ops/propose.ts — MOTEUR DE PROPOSITION pur (W9).
 *
 * Transforme des SIGNAUX RÉELS déjà calculés en propositions d'action, chacune
 *   - déterministe (aucun hasard, même entrée → même sortie),
 *   - explicable (facteurs nommés hérités du score / des chiffres du signal),
 *   - bornée à UNE action sûre (open / draft / approval) — JAMAIS de mutation.
 *
 * Trois familles de signaux, toutes déjà owner-scopées en amont (côté API) :
 *   1. Cartes scorées du centre d'actions (`ScoredAction`) — CRM + radar + HITL.
 *   2. Fuites de funnel (`ConversionReport`) — étage où la perte se concentre.
 *   3. Prospects dormants (`DormantProspect`) — relance possible (brouillon HITL).
 *
 * Zéro I/O, zéro dépendance React. `now`/limites injectés → parfaitement testable.
 */

import type { ScoredAction } from "@/lib/action-center/types";
import type { ConversionReport } from "@/lib/conversion/types";
import type { DormantProspect } from "@/lib/reactivation/types";
import type {
  Proposal,
  ProposalAction,
  ProposalFactor,
  ProposalUrgency,
} from "@/lib/assistant-ops/types";
import {
  ASSISTANT_ACTION_TAKE,
  ASSISTANT_REACTIVATION_TAKE,
  ASSISTANT_FUNNEL_LEAK_MIN_PCT,
  ASSISTANT_FUNNEL_BASE_PRIORITY,
  ASSISTANT_REACTIVATION_BASE_PRIORITY,
  ASSISTANT_DORMANT_SATURATION_DAYS,
  ASSISTANT_PROPOSAL_LIMIT,
} from "@/config/assistant-ops";

/** Libellés injectés (aucun texte en dur ici — viennent de labels.ts / UI.*). */
export type ProposeLabels = {
  /** Perte concentrée à un étage : (part %, étage) → phrase. */
  funnelLeak: (pct: number, stage: string) => string;
  /** Titre d'une proposition de funnel : (étage) → phrase. */
  funnelTitle: (stage: string) => string;
  /** Étiquette d'un étage de funnel (StageId → libellé humain). */
  stageLabel: (stage: string) => string;
  /** Relance d'un dormant : (nom, jours d'inactivité, rôle) → phrase. */
  reactivationRationale: (name: string, days: number, role: string) => string;
  /** Titre d'une relance : (nom) → phrase. */
  reactivationTitle: (name: string) => string;
  /** Étiquette de rôle (acquereur/proprietaire) → libellé humain. */
  roleLabel: (role: string) => string;
};

/** Convertit une priorité d'ActionPriority-like en urgence normalisée. */
function urgencyFromScore(score: number): ProposalUrgency {
  if (score >= 70) return "haute";
  if (score >= 40) return "normale";
  return "basse";
}

/** Borne un score dans [0..100] (jamais NaN, jamais hors bornes). */
function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ─── 1) Cartes scorées → propositions ────────────────────────────────────────

/**
 * Dérive l'action SÛRE d'une carte scorée. Priorité de sûreté :
 *   - catégorie `validation` (approbation HITL) → action `approval`,
 *   - lead avec un quick `message` + entityId → action `draft` (outbox DRAFT),
 *   - sinon → `open` (navigation vers la fiche réelle).
 * Ne renvoie JAMAIS une action mutante directe.
 */
function actionFromScored(a: ScoredAction): ProposalAction {
  // Approbation HITL déjà en file → on route vers la boîte d'approbation.
  if (a.category === "validation" && a.entityId) {
    return { kind: "approval", approvalId: a.entityId, href: a.href };
  }
  // Un lead contactable → proposition de BROUILLON (jamais d'envoi direct).
  if (a.entity === "lead" && a.entityId) {
    const canMessage = a.quick.some((q) => q.kind === "message" || q.kind === "call");
    if (canMessage) {
      // Canal par défaut prudent : email (l'Outbox re-résout la coordonnée réelle).
      return { kind: "draft", leadId: a.entityId, channel: "email", href: a.href };
    }
  }
  // Défaut sûr : ouvrir la fiche réelle.
  return { kind: "open", href: a.href };
}

/** Transforme une carte scorée en proposition (hérite score + facteurs). */
function fromScoredAction(a: ScoredAction): Proposal {
  const factors: ProposalFactor[] = a.explanation.map((c) => ({
    factor: c.factor,
    points: Math.max(0, c.points),
  }));
  return {
    id: `action:${a.id}`,
    source: "action",
    title: a.title,
    rationale: a.reason,
    urgency: urgencyFromScore(a.score),
    priority: clampScore(a.score),
    factors,
    action: actionFromScored(a),
  };
}

// ─── 2) Fuite de funnel → propositions ───────────────────────────────────────

/**
 * Détecte l'étage où la perte se CONCENTRE (part de perte >= seuil) et propose
 * de le traiter. Déterministe : on prend la perte la plus forte au-dessus du
 * seuil. `share` (0..1) du rapport → % ; la priorité croît avec la concentration.
 */
function fromConversion(report: ConversionReport, L: ProposeLabels): Proposal[] {
  const out: Proposal[] = [];
  // Étage de perte le plus concentré au-dessus du seuil.
  const worst = report.losses
    .filter((l) => l.lost > 0)
    .sort((a, b) => b.share - a.share)[0];
  if (!worst) return out;

  const pct = Math.round(worst.share * 100);
  if (pct < ASSISTANT_FUNNEL_LEAK_MIN_PCT) return out;

  // Priorité = base + concentration (part de perte au-delà du seuil), bornée.
  const bonus = pct - ASSISTANT_FUNNEL_LEAK_MIN_PCT;
  const priority = clampScore(ASSISTANT_FUNNEL_BASE_PRIORITY + bonus);
  const stage = L.stageLabel(worst.stage);

  out.push({
    id: `conversion:${worst.stage}`,
    source: "conversion",
    title: L.funnelTitle(stage),
    rationale: L.funnelLeak(pct, stage),
    urgency: urgencyFromScore(priority),
    priority,
    factors: [
      { factor: "funnelLeak", points: bonus },
    ],
    // Action sûre : ouvrir le cockpit de conversion filtré sur l'étage réel.
    action: { kind: "open", href: `/conversion#${worst.stage}` },
  });
  return out;
}

// ─── 3) Dormants → propositions de relance (brouillon HITL) ──────────────────

/**
 * Une relance de dormant devient une proposition de BROUILLON quand une
 * coordonnée existe (canal suggéré non nul + lead_id) ; sinon on propose
 * d'ouvrir la fiche. La priorité croît avec l'inactivité (bornée) et le nombre
 * de biens pertinents (acquéreur). AUCUN envoi — toujours DRAFT.
 */
function fromDormant(p: DormantProspect, L: ProposeLabels): Proposal {
  // Profondeur d'inactivité normalisée [0..1] → bonus.
  const depth = Math.max(
    0,
    Math.min(1, p.jours_inactif / ASSISTANT_DORMANT_SATURATION_DAYS),
  );
  const depthBonus = Math.round(depth * 30);
  const matchBonus = Math.min(15, p.match_hints.length * 5);
  const priority = clampScore(
    ASSISTANT_REACTIVATION_BASE_PRIORITY + depthBonus + matchBonus,
  );

  const factors: ProposalFactor[] = [{ factor: "dormantDepth", points: depthBonus }];
  if (matchBonus > 0) factors.push({ factor: "matchOpportunity", points: matchBonus });

  // Href réel : fiche lead si connue, sinon la page de réactivation.
  const href = p.lead_id ? `/leads/${p.lead_id}` : "/reactivation";

  // Brouillon possible seulement avec un canal ET un lead réels.
  const action: ProposalAction =
    p.suggested_channel && p.lead_id
      ? { kind: "draft", leadId: p.lead_id, channel: p.suggested_channel, href }
      : { kind: "open", href };

  return {
    id: `reactivation:${p.source_id}`,
    source: "reactivation",
    title: L.reactivationTitle(p.full_name),
    rationale: L.reactivationRationale(
      p.full_name,
      p.jours_inactif,
      L.roleLabel(p.role),
    ),
    urgency: urgencyFromScore(priority),
    priority,
    factors,
    action,
  };
}

// ─── Assemblage final ────────────────────────────────────────────────────────

export type ProposeInput = {
  /** Cartes scorées du centre d'actions (déjà triées par score décroissant). */
  scored: ScoredAction[] | null;
  /** Rapport de conversion (segment courant) — null si source indisponible. */
  conversion: ConversionReport | null;
  /** Prospects dormants détectés — null si source indisponible. */
  dormant: DormantProspect[] | null;
  labels: ProposeLabels;
};

/**
 * Fusionne les trois familles, dédoublonne par id, trie par priorité décroissante
 * (départage stable par id), et borne la liste. Chaque source absente est
 * simplement ignorée (null) — jamais de proposition fabriquée pour compenser.
 */
export function buildProposals(input: ProposeInput): Proposal[] {
  const all: Proposal[] = [];

  if (input.scored) {
    for (const a of input.scored.slice(0, ASSISTANT_ACTION_TAKE)) {
      all.push(fromScoredAction(a));
    }
  }
  if (input.conversion) {
    all.push(...fromConversion(input.conversion, input.labels));
  }
  if (input.dormant) {
    for (const p of input.dormant.slice(0, ASSISTANT_REACTIVATION_TAKE)) {
      all.push(fromDormant(p, input.labels));
    }
  }

  // Dédup par id (une entité peut remonter via plusieurs signaux) — garde la plus prioritaire.
  const byId = new Map<string, Proposal>();
  for (const p of all) {
    const prev = byId.get(p.id);
    if (!prev || p.priority > prev.priority) byId.set(p.id, p);
  }

  return [...byId.values()]
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, ASSISTANT_PROPOSAL_LIMIT);
}
