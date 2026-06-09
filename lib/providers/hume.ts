/**
 * lib/providers/hume.ts — Hume AI : analyse d'émotion vocale / textuelle (batch jobs).
 *
 *   humeIsConfigured()            → boolean
 *   submitEmotionJob({ urls?, text? }) → { jobId }
 *   getHumeJob(jobId)             → { status }
 */

import { ProviderUnavailableError, envPresent, fetchJson } from "./types";

const BASE_URL = "https://api.hume.ai/v0/batch/jobs";

interface HumeSubmitResponse {
  job_id?: string;
  [key: string]: unknown;
}

interface HumeJobState {
  status?: string;
  [key: string]: unknown;
}

interface HumeJobDetailResponse {
  state?: HumeJobState | null;
  [key: string]: unknown;
}

export function humeIsConfigured(): boolean {
  return envPresent("HUME_API_KEY");
}

function authHeader(): Record<string, string> {
  return { "X-Hume-Api-Key": process.env.HUME_API_KEY ?? "" };
}

/**
 * Soumet un job d'analyse d'émotion.
 * - Si `urls` fourni → modèle `prosody` (voix).
 * - Si `text` fourni → modèle `language` (texte).
 * Throw ProviderUnavailableError si la clé est absente.
 */
export async function submitEmotionJob(params: {
  urls?: string[];
  text?: string[];
}): Promise<{ jobId: string }> {
  if (!humeIsConfigured()) throw new ProviderUnavailableError("hume");

  const body =
    params.text && params.text.length > 0
      ? { models: { language: {} }, text: params.text }
      : { models: { prosody: {} }, urls: params.urls ?? [] };

  const data = await fetchJson<HumeSubmitResponse>(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
    },
    body: JSON.stringify(body),
  });

  const jobId = typeof data.job_id === "string" ? data.job_id : null;
  if (!jobId) throw new Error("hume: réponse inattendue — champ job_id absent");

  return { jobId };
}

/**
 * Récupère l'état d'un job batch Hume.
 * Parsing défensif : retourne null si state.status absent.
 */
export async function getHumeJob(
  jobId: string,
): Promise<{ status: string | null }> {
  if (!humeIsConfigured()) throw new ProviderUnavailableError("hume");

  const data = await fetchJson<HumeJobDetailResponse>(
    `${BASE_URL}/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: authHeader(),
    },
  );

  const status =
    data.state && typeof data.state.status === "string"
      ? data.state.status
      : null;

  return { status };
}
