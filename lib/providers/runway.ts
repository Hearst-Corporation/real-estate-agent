/**
 * lib/providers/runway.ts — Runway ML image→vidéo (Gen 4).
 *
 * Contrat :
 *   runwayIsConfigured()                  → boolean (lazy, jamais au module load)
 *   createVideoFromImage(params)          → Promise<{ taskId: string }>
 *   getRunwayTask(taskId)                 → Promise<{ status: string; videoUrl: string | null }>
 *
 * Throw ProviderUnavailableError("runway") si RUNWAY_API_KEY absente.
 * Gen-3 est déprécié — modèle par défaut : gen4_turbo.
 */

import { ProviderUnavailableError, envPresent, fetchJson } from "./types";

const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";
export const DEFAULT_RUNWAY_MODEL = "gen4_turbo";

// ─── Helpers ────────────────────────────────────────────────────────────────

function runwayHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.RUNWAY_API_KEY ?? ""}`,
    "X-Runway-Version": RUNWAY_VERSION,
    "Content-Type": "application/json",
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function runwayIsConfigured(): boolean {
  return envPresent("RUNWAY_API_KEY");
}

export interface RunwayCreateParams {
  promptImage: string;
  promptText?: string;
  model?: string;
}

export interface RunwayCreateResult {
  taskId: string;
}

/**
 * Lance une génération image→vidéo sur Runway.
 * Renvoie { taskId } à poller via getRunwayTask().
 */
export async function createVideoFromImage(
  params: RunwayCreateParams,
): Promise<RunwayCreateResult> {
  if (!runwayIsConfigured()) throw new ProviderUnavailableError("runway");

  const body = {
    promptImage: params.promptImage,
    promptText: params.promptText,
    model: params.model ?? DEFAULT_RUNWAY_MODEL,
  };

  const data = await fetchJson<{ id?: unknown }>(
    `${RUNWAY_BASE}/image_to_video`,
    {
      method: "POST",
      headers: runwayHeaders(),
      body: JSON.stringify(body),
    },
  );

  const taskId = typeof data.id === "string" ? data.id : String(data.id ?? "");
  return { taskId };
}

export interface RunwayTaskResult {
  status: string;
  videoUrl: string | null;
}

/**
 * Récupère l'état d'une tâche Runway.
 * videoUrl est null tant que le rendu n'est pas terminé.
 */
export async function getRunwayTask(taskId: string): Promise<RunwayTaskResult> {
  if (!runwayIsConfigured()) throw new ProviderUnavailableError("runway");

  const data = await fetchJson<{
    status?: unknown;
    output?: unknown[];
  }>(`${RUNWAY_BASE}/tasks/${taskId}`, {
    method: "GET",
    headers: runwayHeaders(),
  });

  const status = typeof data.status === "string" ? data.status : "unknown";

  // output[0] est l'URL de la vidéo rendue (absent ou non-string tant que pending).
  const firstOutput = Array.isArray(data.output) ? data.output[0] : undefined;
  const videoUrl =
    typeof firstOutput === "string" && firstOutput.length > 0
      ? firstOutput
      : null;

  return { status, videoUrl };
}
