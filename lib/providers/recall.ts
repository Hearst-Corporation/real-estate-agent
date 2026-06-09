/**
 * lib/providers/recall.ts — Recall.ai : bot de réunion (transcription, enregistrement).
 *
 *   recallIsConfigured()          → boolean
 *   createMeetingBot({ meetingUrl, botName? }) → { botId }
 *   getRecallBot(botId)           → { status, transcriptUrl }
 */

import { ProviderUnavailableError, envPresent, fetchJson } from "./types";

const BASE_URL = "https://us-east-1.recall.ai/api/v1";
const DEFAULT_BOT_NAME = "Real Estate Agent Notetaker";

interface RecallBotResponse {
  id?: string;
  [key: string]: unknown;
}

interface RecallStatusChange {
  code?: string;
  [key: string]: unknown;
}

interface RecallBotDetailResponse {
  status_changes?: RecallStatusChange[];
  video_url?: string | null;
  transcript?: { url?: string | null } | null;
  [key: string]: unknown;
}

export function recallIsConfigured(): boolean {
  return envPresent("RECALL_API_KEY");
}

function authHeader(): Record<string, string> {
  return { Authorization: `Token ${process.env.RECALL_API_KEY ?? ""}` };
}

/**
 * Crée un bot de réunion sur l'URL fournie.
 * Throw ProviderUnavailableError si la clé est absente.
 */
export async function createMeetingBot(params: {
  meetingUrl: string;
  botName?: string;
}): Promise<{ botId: string }> {
  if (!recallIsConfigured()) throw new ProviderUnavailableError("recall");

  const body = {
    meeting_url: params.meetingUrl,
    bot_name: params.botName ?? DEFAULT_BOT_NAME,
  };

  const data = await fetchJson<RecallBotResponse>(`${BASE_URL}/bot/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
    },
    body: JSON.stringify(body),
  });

  const botId = typeof data.id === "string" ? data.id : null;
  if (!botId) throw new Error("recall: réponse inattendue — champ id absent");

  return { botId };
}

/**
 * Récupère l'état courant d'un bot et une URL de transcript si disponible.
 * Parsing défensif : retourne null sur tout champ absent.
 */
export async function getRecallBot(botId: string): Promise<{
  status: string | null;
  transcriptUrl: string | null;
}> {
  if (!recallIsConfigured()) throw new ProviderUnavailableError("recall");

  const data = await fetchJson<RecallBotDetailResponse>(
    `${BASE_URL}/bot/${encodeURIComponent(botId)}`,
    {
      method: "GET",
      headers: authHeader(),
    },
  );

  // Dernier status dans status_changes (ordre chronologique, dernier = état courant)
  const changes = Array.isArray(data.status_changes) ? data.status_changes : [];
  const lastChange = changes.length > 0 ? changes[changes.length - 1] : null;
  const status =
    lastChange && typeof lastChange.code === "string" ? lastChange.code : null;

  // URL de transcript : champ transcript.url ou video_url en fallback
  const transcriptUrl =
    (typeof data.transcript?.url === "string" ? data.transcript.url : null) ??
    (typeof data.video_url === "string" ? data.video_url : null);

  return { status, transcriptUrl };
}
