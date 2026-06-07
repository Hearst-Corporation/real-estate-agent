// ─── Missions — traduction plan-architect + run → phases humaines ────────────
//
// LE CŒUR de la couche user-friendly. Le moteur MySwarms parle agents/tasks/
// runs ; l'utilisateur voit Comprendre → Planifier → Explorer → Créer →
// Vérifier → Livrer. Cette fonction est PURE (testable sans moteur) : elle
// prend la spec de l'architect + l'état d'un run et produit la `MissionView`.
//
// Rappel d'archi (cf. recon) : le moteur ne fait que des runs ATOMIQUES, sans
// step nommé de phase. On dérive donc les phases du RÔLE de l'agent qui porte
// chaque task + l'ordre, et on superpose l'avancement lu dans run.steps.

import type { SwarmRun, SwarmTask } from "@/lib/swarms/types";
import type {
  MissionDecision,
  MissionPhase,
  MissionPlan,
  MissionStatus,
  MissionView,
  PhaseStatus,
} from "@/lib/missions/types";

/** Phases canoniques, dans l'ordre. `comprendre`/`livrer` sont des phases de
 *  cadrage (pas de task moteur) ; les 4 du milieu reçoivent les tasks par rôle. */
type PhaseDef = {
  key: string;
  emo: string;
  nm: string;
  roles: string[]; // rôles d'agent CrewAI rattachés à cette phase
  framing?: boolean;
  story: { done: string; now: string; todo: string };
  doing: string;
};

const PHASES: PhaseDef[] = [
  {
    key: "comprendre", emo: "🧠", nm: "Comprendre", roles: [], framing: true,
    story: { done: "J'ai compris ton objectif", now: "Je clarifie ton objectif", todo: "Je comprendrai ton objectif" },
    doing: "Je reformule ta demande pour viser juste.",
  },
  {
    key: "planifier", emo: "🗺️", nm: "Planifier", roles: ["coordinator"],
    story: { done: "J'ai préparé le plan", now: "Je prépare le plan", todo: "Je préparerai le plan" },
    doing: "Je prépare les grandes étapes et les ressources nécessaires.",
  },
  {
    key: "explorer", emo: "🔍", nm: "Explorer", roles: ["analyst", "tool_runner"],
    story: { done: "J'ai exploré le terrain", now: "J'explore le terrain", todo: "J'explorerai le terrain" },
    doing: "J'analyse, je compare et je rassemble la matière.",
  },
  {
    key: "creer", emo: "✍️", nm: "Créer", roles: ["executor"],
    story: { done: "J'ai créé les propositions", now: "Je crée les propositions", todo: "Je créerai les propositions" },
    doing: "Je transforme la matière en livrable.",
  },
  {
    key: "verifier", emo: "✅", nm: "Vérifier", roles: ["reviewer"],
    story: { done: "J'ai vérifié la qualité", now: "Je vérifie la qualité et les risques", todo: "Je vérifierai avant de livrer" },
    doing: "Je contrôle la qualité, la cohérence et les risques.",
  },
  {
    key: "livrer", emo: "📦", nm: "Livrer", roles: [], framing: true,
    story: { done: "J'ai préparé le résultat final", now: "Je prépare le résultat final", todo: "Je préparerai le résultat final" },
    doing: "Je prépare le résultat final.",
  },
];

const ROLE_TO_PHASE: Record<string, string> = {
  coordinator: "planifier",
  analyst: "explorer",
  researcher: "explorer",
  tool_runner: "explorer",
  executor: "creer",
  writer: "creer",
  reviewer: "verifier",
  critic: "verifier",
};

const STATUS_LABEL: Record<string, string> = {
  comprendre: "Compréhension",
  planifier: "Plan",
  explorer: "Exploration",
  creer: "Création",
  verifier: "Vérification",
  livrer: "Livraison",
};

const MAX_FOUND = 4;
const FOUND_CHARS = 160;

/** Rattache chaque task à une phase via le rôle de son agent (défaut: créer). */
function tasksByPhase(plan: MissionPlan | null): Record<string, SwarmTask[]> {
  const map: Record<string, SwarmTask[]> = Object.fromEntries(PHASES.map((p) => [p.key, []]));
  if (!plan) return map;
  const roleOf = (agentName?: string) =>
    plan.spec.agents.find((a) => a.name === agentName)?.role?.toLowerCase() ?? "";
  for (const t of plan.spec.tasks ?? []) {
    const key = ROLE_TO_PHASE[roleOf(t.agent_name)] ?? "creer";
    map[key].push(t);
  }
  return map;
}

/** Noms de tasks "terminées" d'après les steps du run (best-effort). */
function completedTaskNames(run: SwarmRun | null): Set<string> {
  const s = new Set<string>();
  for (const step of run?.steps ?? []) {
    if (step.task && (step.output || run?.status === "done")) s.add(step.task);
  }
  return s;
}

function truncate(v: string): string {
  const t = v.trim().replace(/\s+/g, " ");
  return t.length > FOUND_CHARS ? t.slice(0, FOUND_CHARS) + "…" : t;
}

/**
 * Construit la `MissionView` à partir de la mission persistée et de l'état du
 * run courant. `decision` est porté par la mission (orchestré côté Next), pas
 * par le moteur.
 */
export function buildMissionView(input: {
  id: string;
  title: string;
  objective: string;
  status: MissionStatus;
  plan: MissionPlan | null;
  run: SwarmRun | null;
  decision: MissionDecision | null;
  error?: string | null;
}): MissionView {
  const { id, title, objective, status, plan, run, decision } = input;
  const byPhase = tasksByPhase(plan);
  const done = completedTaskNames(run);
  const runStarted = !!run && run.status !== "pending";
  const runFinished = run?.status === "done";
  const runFailed = run?.status === "failed" || run?.status === "error";

  // Statut de chaque phase.
  const rawStatuses: PhaseStatus[] = PHASES.map((def) => {
    if (def.key === "comprendre") return plan ? "done" : runStarted ? "now" : "todo";
    if (def.key === "livrer") return runFinished ? "done" : "todo";
    const tasks = byPhase[def.key];
    if (tasks.length === 0) return runFinished ? "done" : "todo";
    const doneCount = tasks.filter((t) => done.has(t.name)).length;
    if (doneCount === tasks.length) return "done";
    if (doneCount > 0 || runStarted) return "now";
    return "todo";
  });

  // Une seule phase "now" (la première non-done) ; le reste passe en todo.
  let currentIdx = rawStatuses.findIndex((s) => s !== "done");
  if (currentIdx === -1) currentIdx = PHASES.length - 1;
  const statuses: PhaseStatus[] = rawStatuses.map((s, i) => {
    if (s === "done") return "done";
    if (i === currentIdx) return status === "awaiting_decision" ? "ask" : runFailed ? "todo" : "now";
    return "todo";
  });

  // Résultats intermédiaires par phase (extraits des outputs de steps).
  const foundByPhase: Record<string, string[]> = Object.fromEntries(PHASES.map((p) => [p.key, []]));
  for (const step of run?.steps ?? []) {
    if (!step.output) continue;
    const phaseKey =
      PHASES.find((p) => byPhase[p.key]?.some((t) => t.name === step.task))?.key ?? "explorer";
    const bucket = foundByPhase[phaseKey];
    if (bucket.length < MAX_FOUND) bucket.push(truncate(step.output));
  }

  const phases: MissionPhase[] = PHASES.map((def, i) => ({
    key: def.key,
    emo: def.emo,
    nm: def.nm,
    status: statuses[i],
    story: statuses[i] === "done" ? def.story.done : statuses[i] === "todo" ? def.story.todo : def.story.now,
    doing: def.doing,
    found: foundByPhase[def.key],
  }));

  const doneN = statuses.filter((s) => s === "done").length;
  const progress = runFinished ? 100 : Math.round((doneN / PHASES.length) * 100 + (statuses[currentIdx] === "now" ? 8 : 0));
  const stepLabel = `Étape ${Math.min(currentIdx + 1, PHASES.length)} sur ${PHASES.length}`;

  const humanStatus = runFailed
    ? "Point bloquant"
    : status === "awaiting_decision"
      ? "En attente de ton avis"
      : status === "done" || runFinished
        ? "Terminé"
        : status === "paused"
          ? "En pause"
          : `En cours — ${STATUS_LABEL[PHASES[currentIdx].key]}`;

  // Aperçu du livrable : le résultat final s'il existe, sinon le dernier output.
  let output: MissionView["output"] = null;
  const finalText = typeof run?.output === "string" ? run.output : null;
  const lastStep = [...(run?.steps ?? [])].reverse().find((s) => s.output)?.output ?? null;
  const body = finalText ?? lastStep;
  if (body) {
    const lines = body.trim().split("\n").filter(Boolean);
    output = { hook: lines[0]?.slice(0, 140), body: lines.slice(1).join("\n").slice(0, 600) || undefined };
  }

  return {
    id,
    title,
    objective,
    status,
    humanStatus,
    stepLabel,
    progress: Math.max(0, Math.min(100, progress)),
    phases,
    decision: status === "awaiting_decision" ? decision : null,
    output,
    error: input.error ?? null,
  };
}
