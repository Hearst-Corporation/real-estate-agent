/**
 * lib/providers/meshy.ts — Génération 3D text-to-3D via Meshy.ai.
 *
 * Use cases immo : visualisation 3D de biens, maquettes interactives.
 * Flux en deux étapes : createTextTo3D (lance le job) → getMeshyTask (poll statut + URL modèle).
 *
 *   meshyIsConfigured()                → boolean
 *   createTextTo3D(prompt, opts?)      → { taskId }
 *   getMeshyTask(taskId)               → { status, modelUrl }
 */

import { ProviderUnavailableError, envPresent, fetchJson } from "./types";

const MESHY_BASE_URL = "https://api.meshy.ai/openapi/v2";
const MESHY_TEXT_TO_3D_ENDPOINT = `${MESHY_BASE_URL}/text-to-3d`;
const DEFAULT_MESHY_MODE = "preview";

export interface MeshyTaskRef {
  taskId: string;
}

export interface MeshyTaskStatus {
  status: string;
  modelUrl: string | null;
}

export function meshyIsConfigured(): boolean {
  return envPresent("MESHY_API_KEY");
}

/** Lance un job text-to-3D. Retourne le taskId pour polling. Throw si non configuré. */
export async function createTextTo3D(
  prompt: string,
  opts?: { mode?: string },
): Promise<MeshyTaskRef> {
  if (!meshyIsConfigured()) throw new ProviderUnavailableError("meshy");

  const mode = opts?.mode ?? DEFAULT_MESHY_MODE;

  const data = await fetchJson<{ result?: unknown }>(MESHY_TEXT_TO_3D_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MESHY_API_KEY ?? ""}`,
    },
    body: JSON.stringify({ mode, prompt }),
  });

  const taskId = typeof data.result === "string" ? data.result : "";

  return { taskId };
}

/** Récupère le statut et l'URL GLB d'un job Meshy. Throw si non configuré. */
export async function getMeshyTask(taskId: string): Promise<MeshyTaskStatus> {
  if (!meshyIsConfigured()) throw new ProviderUnavailableError("meshy");

  const data = await fetchJson<{
    status?: unknown;
    model_urls?: Record<string, unknown>;
  }>(`${MESHY_TEXT_TO_3D_ENDPOINT}/${taskId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.MESHY_API_KEY ?? ""}`,
    },
  });

  const status = typeof data.status === "string" ? data.status : "unknown";
  const glb = data.model_urls?.glb;
  const modelUrl = typeof glb === "string" ? glb : null;

  return { status, modelUrl };
}
