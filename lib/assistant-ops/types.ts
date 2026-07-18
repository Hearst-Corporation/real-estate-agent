/**
 * lib/assistant-ops/types.ts — modèle de l'ASSISTANT OPÉRATIONNEL (W9).
 *
 * L'assistant est une COUCHE DE PROPOSITION au-dessus des signaux déjà calculés
 * (centre d'actions scoré, conversion, réactivation). Il NE FABRIQUE JAMAIS de
 * donnée, NE lance JAMAIS d'action directe : chaque proposition est
 *   1. DÉRIVÉE d'un signal réel (une carte scorée, un étage de funnel, un dormant),
 *   2. EXPLICABLE (facteurs nommés hérités du score, jamais un chiffre opaque),
 *   3. rattachée à une VRAIE entité (href réel),
 *   4. bornée à une SEULE action sûre : ouvrir la fiche, préparer un BROUILLON
 *      (outbox DRAFT), ou envoyer en APPROBATION (HITL). Aucune mutation directe.
 *
 * La frontière Aigent (`lib/aigent/runtime`) est CONSOMMÉE en lecture pour savoir
 * si un exécutant automatisé est disponible. Absente → l'assistant reste
 * pleinement fonctionnel en mode LOCAL (analyse + propositions déterministes),
 * et l'automatisation est signalée CONFIG/UNAVAILABLE honnêtement — jamais un
 * faux run, jamais un faux agent.
 *
 * Types purs (serveur + client), zéro dépendance React, zéro I/O.
 */

import type { RuntimeUnavailableReason } from "@/lib/aigent/runtime-types";
import type { ScoreFactor } from "@/lib/action-center/types";

/** Nature de l'action sûre qu'une proposition suggère. JAMAIS de mutation directe. */
export type ProposalAction =
  /** Ouvrir la fiche/entité réelle (lecture, navigation). */
  | { kind: "open"; href: string }
  /**
   * Préparer un BROUILLON de message (outbox DRAFT). Ne part PAS : il faudra une
   * validation humaine explicite dans l'Outbox. `channel` = canal recommandé.
   */
  | { kind: "draft"; leadId: string; channel: DraftChannel; href: string }
  /**
   * Envoyer en APPROBATION humaine (HITL) — pour une communication/mutation
   * sensible déjà en file. Route vers la boîte d'approbation, jamais d'exécution.
   */
  | { kind: "approval"; approvalId: string; href: string };

/** Canaux de brouillon supportés (miroir de OutboxChannel, borné ici pour le typage). */
export type DraftChannel = "email" | "sms" | "whatsapp";

/** Origine du signal qui a produit la proposition (traçabilité, jamais inventée). */
export type ProposalSource =
  | "action" // carte du centre d'actions scoré (CRM + radar + approbations)
  | "conversion" // étage de funnel en fuite (perte concentrée)
  | "reactivation"; // prospect dormant à relancer

/** Urgence normalisée, dérivée du score/facteurs (déterministe, pas un avis). */
export type ProposalUrgency = "haute" | "normale" | "basse";

/** Un facteur explicatif hérité du score ou des chiffres du signal (nommé, fini). */
export type ProposalFactor = {
  /** Clé stable : soit un facteur de score, soit un facteur propre à l'assistant. */
  factor: ScoreFactor | AssistantFactor;
  /** Contribution lisible (points ou repère). Jamais négative. */
  points: number;
};

/** Facteurs propres à l'assistant (au-delà des facteurs de score du centre d'actions). */
export type AssistantFactor =
  | "funnelLeak" // perte concentrée à un étage du funnel
  | "dormantDepth" // profondeur d'inactivité d'un prospect
  | "matchOpportunity"; // biens pertinents disponibles pour un dormant

/**
 * Une proposition = « voici la prochaine action la plus utile, et pourquoi ».
 * Déterministe, explicable, rattachée à une entité réelle, bornée à une action sûre.
 */
export type Proposal = {
  /** Id STABLE pour React, dérivé de la source (`${source}:${entityId}`). */
  id: string;
  source: ProposalSource;
  /** Ligne 1 — QUOI / QUI (déjà formaté, jamais un id brut). */
  title: string;
  /** Ligne 2 — POURQUOI (raison métier explicite, déterministe). */
  rationale: string;
  urgency: ProposalUrgency;
  /** Score de priorité borné [0..100], hérité/dérivé de façon déterministe. */
  priority: number;
  /** Facteurs qui expliquent la priorité (somme ~ priority avant plafond). */
  factors: ProposalFactor[];
  /** L'unique action sûre suggérée (open / draft / approval). */
  action: ProposalAction;
};

/**
 * Disponibilité de l'exécutant automatisé (frontière Aigent), pour l'affichage.
 * `analysisOnly` = Aigent absent mais l'assistant fonctionne en LOCAL (propositions
 * déterministes servies malgré tout — état honnête, pas une panne).
 */
export type AutomationStatus =
  | { mode: "live"; agentCount: number }
  | { mode: "config"; reason: RuntimeUnavailableReason }
  | { mode: "unavailable" };

/** Statut d'une source de signal (vérité LIVE / UNAVAILABLE honnête). */
export type SignalStatus = "live" | "unavailable";

/** Réponse complète de l'assistant opérationnel (ce que l'API renvoie). */
export type AssistantResponse = {
  /** Propositions triées par priorité décroissante (les plus utiles en premier). */
  proposals: Proposal[];
  /** État de l'automatisation Aigent (LIVE / CONFIG / UNAVAILABLE). */
  automation: AutomationStatus;
  /** Statut par source de signal (analyse locale). */
  signals: {
    actions: SignalStatus;
    conversion: SignalStatus;
    reactivation: SignalStatus;
  };
  total: number;
  /** Instant de calcul (ISO). */
  computedAt: string;
};
