// ─── Missions — contrat de la Mission View (couche user-friendly des swarms) ──
//
// Le front (Mission View) ne consomme QUE ces types. Aucun terme technique
// (agent/swarm/run/task) ne traverse cette frontière : la traduction se fait
// dans phases.ts. Voir docs/mission-view.html pour la cible visuelle.

import type { SwarmAgent, SwarmTask } from "@/lib/swarms/types";

/** Statut métier d'une mission (= colonne missions.status). */
export type MissionStatus =
  | "planning" // l'IA prépare le plan (architect)
  | "running" // un sous-run tourne
  | "awaiting_decision" // en attente d'un choix humain
  | "done"
  | "failed"
  | "paused";

/** Statut d'une phase, en langage humain (pas running/queued/failed). */
export type PhaseStatus = "done" | "now" | "ask" | "todo";

/** Une carte de l'Espace de travail vivant (Comprendre → Livrer). */
export type MissionPhase = {
  key: string;
  emo: string;
  nm: string;
  status: PhaseStatus;
  /** Phrase humaine, accordée au temps (passé si done, présent si now…). */
  story: string;
  /** "Ce qui se passe" — descriptif de l'étape en cours. */
  doing: string;
  /** "Ce qui est déjà trouvé" — extraits de résultats intermédiaires. */
  found: string[];
};

/** Un moment de décision présenté à l'utilisateur. */
export type MissionDecisionOption = { value: string; label: string; sub?: string };
export type MissionDecision = {
  question: string;
  hint?: string;
  options: MissionDecisionOption[];
};

/** Le plan dérivé de l'architect, stocké dans missions.plan. */
export type MissionPlan = {
  /** Spec brute de l'architect (réutilisée pour rejouer/relancer). */
  spec: { name: string; description?: string; agents: SwarmAgent[]; tasks: SwarmTask[] };
};

/** Aperçu du livrable en cours. */
export type MissionOutput = { hook?: string; body?: string };

/** Vue complète consommée par la page /missions/[id] (RSC + polling). */
export type MissionView = {
  id: string;
  title: string;
  objective: string;
  status: MissionStatus;
  /** Statut humain pour le header (ex. "En cours — Création"). */
  humanStatus: string;
  /** "Étape 3 sur 6". */
  stepLabel: string;
  /** 0..100. */
  progress: number;
  phases: MissionPhase[];
  /** Décision en attente, ou null. */
  decision: MissionDecision | null;
  output: MissionOutput | null;
  error: string | null;
};
