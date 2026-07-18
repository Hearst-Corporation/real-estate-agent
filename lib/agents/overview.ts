/**
 * lib/agents/overview.ts — Données de la page /agents (lecture seule).
 *
 * Roster des copilotes IA de ce produit. Développés séparément (Aigent /
 * LangSmith, cf. CLAUDE.md §Modules produit) — cette page ne fait qu'afficher
 * l'état connu, jamais orchestrer d'exécution (le moteur Swarms interne a été
 * retiré, décision produit, ne pas le réintroduire ici).
 *
 * Encapsulation volontaire : la page appelle uniquement `buildAgentRoster()`
 * et ne connaît jamais la source réelle des données. Aujourd'hui c'est une
 * liste statique (aucune table `agents` en DB) ; demain ce sera un fetch vers
 * l'API Aigent du projet — le remplacement se fait ici, sans toucher la page.
 */

export type AgentRosterStatus = "spec" | "draft" | "live";

export interface AgentRosterEntry {
  id: string;
  name: string;
  focus: string;
  description: string;
  status: AgentRosterStatus;
}

const ROSTER: readonly AgentRosterEntry[] = [
  {
    id: "interview-api-sentinel",
    name: "Interview API Sentinel",
    focus: "Entretien d'estimation",
    description:
      "Audite en lecture seule le parcours d'entretien d'estimation (auth, tenanting, validation d'entrée, contrat de réponse NDJSON) sur les routes /api/estimations/**. Aucune écriture, aucune correction automatique — findings + approbation humaine.",
    status: "spec",
  },
];

export async function buildAgentRoster(): Promise<AgentRosterEntry[]> {
  return [...ROSTER];
}
