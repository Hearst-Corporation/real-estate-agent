/**
 * lib/action-center/aggregate.ts — AGRÉGATION du centre d'actions quotidien (W1).
 *
 * Fonctions PURES : reçoivent des données déjà lues (owner-scoped côté API) et
 * produisent des ScoredAction. On RÉUTILISE la dérivation existante (`lib/actions`)
 * pour le cœur, et on ADAPTE les signaux radar (`lib/radar`) + les approbations
 * (`lib/approvals`) en ActionItem cliquables, chacune avec une prochaine action réelle.
 *
 * Chaque carte radar/approbation pointe vers une VRAIE entité (href réel) — jamais
 * d'action orpheline, jamais de donnée fabriquée. Le `signalStrength` (0..1) fourni
 * au scoring est DÉTERMINISTE (dérivé des chiffres réels du signal).
 *
 * Zéro I/O, zéro dépendance React.
 */

import type { ActionItem } from "@/lib/actions/types";
import type {
  DormantSignal,
  MandateExpirySignal,
  PriceDropSignal,
} from "@/lib/radar/signals";
import type { ScoredAction } from "@/lib/action-center/types";
import { scoreAction, sortScored } from "@/lib/action-center/score";

/** Ancienneté (jours) au-delà de laquelle une annonce dormante sature son signal. */
const DORMANT_SATURATION_DAYS = 180;
/** Baisse de prix (%) à partir de laquelle le signal de baisse sature. */
const PRICE_DROP_SATURATION_PCT = 15;
/** Fenêtre (jours) d'expiration mandat sur laquelle l'urgence est normalisée. */
const MANDATE_EXPIRY_SATURATION_DAYS = 30;

/** Libellés injectés (aucun texte en dur ici — viennent de UI.*). */
export type RadarLabels = {
  priceDrop: (pct: number, eur: number) => string;
  dormant: (days: number) => string;
  mandateExpiry: (days: number) => string;
  fallbackAnnonce: string;
  fallbackMandate: string;
};

export type ApprovalLabels = {
  pending: (channel: string) => string;
  fallback: string;
};

/** Ligne minimale d'approbation en attente (sous-ensemble de ApprovalRow). */
export type PendingApprovalRow = {
  id: string;
  channel: string;
  created_at: string | null;
};

// ─── Adaptateurs radar → ActionItem (+ signalStrength déterministe) ────────────

/** Baisse de prix : signalStrength = drop_pct / seuil de saturation (0..1). */
function priceDropToItem(
  s: PriceDropSignal,
  L: RadarLabels,
): { item: ActionItem; strength: number } {
  const item: ActionItem = {
    id: `radar-drop:${s.annonce_id}`,
    category: "proprietaire",
    entity: "annonce",
    entityId: s.annonce_id,
    title: s.titre ?? s.ville ?? L.fallbackAnnonce,
    reason: L.priceDrop(s.drop_pct, s.drop_eur),
    priority: "haute",
    when: s.observed_at,
    href: "/radar",
    quick: [{ kind: "open", href: "/radar" }],
  };
  const strength = Math.max(0, Math.min(1, s.drop_pct / PRICE_DROP_SATURATION_PCT));
  return { item, strength };
}

/** Annonce dormante : signalStrength = jours_dormant / saturation (0..1). */
function dormantToItem(
  s: DormantSignal,
  L: RadarLabels,
): { item: ActionItem; strength: number } {
  const item: ActionItem = {
    id: `radar-dormant:${s.annonce_id}`,
    category: "proprietaire",
    entity: "annonce",
    entityId: s.annonce_id,
    title: s.titre ?? s.ville ?? L.fallbackAnnonce,
    reason: L.dormant(s.jours_dormant),
    priority: "normale",
    when: s.since,
    href: "/radar",
    quick: [{ kind: "open", href: "/radar" }],
  };
  const strength = Math.max(0, Math.min(1, s.jours_dormant / DORMANT_SATURATION_DAYS));
  return { item, strength };
}

/**
 * Mandat expirant : signalStrength croît quand l'échéance approche (ou est dépassée).
 * jours_restants=0 → 1 ; jours_restants=fenêtre → ~0 ; déjà expiré → 1.
 */
function mandateExpiryToItem(
  s: MandateExpirySignal,
  L: RadarLabels,
): { item: ActionItem; strength: number } {
  const item: ActionItem = {
    id: `radar-mandate:${s.mandate_id}`,
    category: "mandat",
    entity: "mandate",
    entityId: s.mandate_id,
    title: s.reference ?? L.fallbackMandate,
    reason: L.mandateExpiry(s.jours_restants),
    priority: "haute",
    when: s.expires_at,
    href: "/mandates",
    quick: [{ kind: "open", href: "/mandates" }],
  };
  const remaining = Math.max(0, s.jours_restants);
  const strength = Math.max(
    0,
    Math.min(1, 1 - remaining / MANDATE_EXPIRY_SATURATION_DAYS),
  );
  return { item, strength };
}

/** Approbation en attente → carte de validation cliquable vers /approvals. */
function approvalToItem(r: PendingApprovalRow, L: ApprovalLabels): ActionItem {
  return {
    id: `approval:${r.id}`,
    category: "validation",
    entity: "general",
    entityId: r.id,
    title: r.channel ? L.pending(r.channel) : L.fallback,
    reason: L.pending(r.channel || ""),
    priority: "haute",
    when: r.created_at ?? undefined,
    href: "/approvals",
    quick: [{ kind: "open", href: "/approvals" }, { kind: "validate" }],
  };
}

// ─── Agrégation finale ──────────────────────────────────────────────────────

export type RadarSignals = {
  priceDrops: PriceDropSignal[];
  dormant: DormantSignal[];
  mandateExpiries: MandateExpirySignal[];
};

/**
 * Fusionne les ActionItem du cœur (déjà dérivées) + les cartes radar + les
 * approbations en attente, score chacune, dédoublonne par id, trie par score.
 * `nowMs` injecté (un seul instant) pour des scores stables et testables.
 */
export function aggregateDailyCenter(input: {
  coreItems: ActionItem[];
  radar: RadarSignals | null;
  approvals: PendingApprovalRow[] | null;
  nowMs: number;
  radarLabels: RadarLabels;
  approvalLabels: ApprovalLabels;
}): ScoredAction[] {
  const scored: ScoredAction[] = [];

  // Cœur : items déjà dérivés (pas de signal radar).
  for (const it of input.coreItems) {
    scored.push(scoreAction(it, input.nowMs));
  }

  // Radar : chaque signal devient une carte scorée avec sa force.
  if (input.radar) {
    for (const s of input.radar.priceDrops) {
      const { item, strength } = priceDropToItem(s, input.radarLabels);
      scored.push(scoreAction(item, input.nowMs, strength));
    }
    for (const s of input.radar.dormant) {
      const { item, strength } = dormantToItem(s, input.radarLabels);
      scored.push(scoreAction(item, input.nowMs, strength));
    }
    for (const s of input.radar.mandateExpiries) {
      const { item, strength } = mandateExpiryToItem(s, input.radarLabels);
      scored.push(scoreAction(item, input.nowMs, strength));
    }
  }

  // Approbations HITL en attente.
  if (input.approvals) {
    for (const r of input.approvals) {
      scored.push(scoreAction(approvalToItem(r, input.approvalLabels), input.nowMs));
    }
  }

  // Dédup par id (une entité peut remonter via cœur ET radar — on garde le plus fort).
  const byId = new Map<string, ScoredAction>();
  for (const s of scored) {
    const prev = byId.get(s.id);
    if (!prev || s.score > prev.score) byId.set(s.id, s);
  }

  return sortScored([...byId.values()]);
}
