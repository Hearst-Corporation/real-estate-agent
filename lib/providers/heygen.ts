/**
 * lib/providers/heygen.ts — HeyGen avatar vidéo (API v2).
 *
 * Contrat :
 *   heygenIsConfigured()                  → boolean (lazy, jamais au module load)
 *   createAvatarVideo(params)             → Promise<{ videoId: string }>
 *   getHeygenStatus(videoId)              → Promise<{ status: string; videoUrl: string | null }>
 *
 * Throw ProviderUnavailableError("heygen") si HEYGEN_API_KEY absente.
 */

import { ProviderUnavailableError, envPresent, fetchJson } from "./types";

const HEYGEN_GENERATE = "https://api.heygen.com/v2/video/generate";
const HEYGEN_STATUS_BASE = "https://api.heygen.com/v1/video_status.get";

// ─── Helpers ────────────────────────────────────────────────────────────────

function heygenHeaders(): Record<string, string> {
  return {
    "X-Api-Key": process.env.HEYGEN_API_KEY ?? "",
    "Content-Type": "application/json",
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function heygenIsConfigured(): boolean {
  return envPresent("HEYGEN_API_KEY");
}

export interface HeygenAvatarParams {
  avatarId: string;
  voiceId: string;
  inputText: string;
}

export interface HeygenCreateResult {
  videoId: string;
}

/**
 * Lance la génération d'une vidéo avatar HeyGen.
 * Renvoie { videoId } à poller via getHeygenStatus().
 */
export async function createAvatarVideo(
  params: HeygenAvatarParams,
): Promise<HeygenCreateResult> {
  if (!heygenIsConfigured()) throw new ProviderUnavailableError("heygen");

  const body = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: params.avatarId,
        },
        voice: {
          type: "text",
          input_text: params.inputText,
          voice_id: params.voiceId,
        },
      },
    ],
  };

  const data = await fetchJson<{ data?: { video_id?: unknown } }>(
    HEYGEN_GENERATE,
    {
      method: "POST",
      headers: heygenHeaders(),
      body: JSON.stringify(body),
    },
  );

  // Parsing défensif : data.data.video_id attendu mais peut être absent/non-string.
  const videoId =
    typeof data.data?.video_id === "string"
      ? data.data.video_id
      : String(data.data?.video_id ?? "");

  return { videoId };
}

export interface HeygenStatusResult {
  status: string;
  videoUrl: string | null;
}

/**
 * Interroge le statut d'une vidéo HeyGen.
 * videoUrl est null tant que le rendu n'est pas terminé.
 */
export async function getHeygenStatus(
  videoId: string,
): Promise<HeygenStatusResult> {
  if (!heygenIsConfigured()) throw new ProviderUnavailableError("heygen");

  const url = `${HEYGEN_STATUS_BASE}?video_id=${encodeURIComponent(videoId)}`;

  const data = await fetchJson<{
    data?: { status?: unknown; video_url?: unknown };
  }>(url, {
    method: "GET",
    headers: heygenHeaders(),
  });

  const status =
    typeof data.data?.status === "string" ? data.data.status : "unknown";

  const videoUrl =
    typeof data.data?.video_url === "string" &&
    data.data.video_url.length > 0
      ? data.data.video_url
      : null;

  return { status, videoUrl };
}
