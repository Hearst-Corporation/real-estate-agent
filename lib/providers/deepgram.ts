/**
 * lib/providers/deepgram.ts — Deepgram Speech-to-Text.
 *
 *   deepgramIsConfigured()                  → boolean
 *   transcribeAudio(audio, opts?)           → Promise<{ transcript: string; confidence: number | null }>
 *
 * L'audio est envoyé en binaire (Buffer) via POST.
 * La réponse JSON est parsée défensivement (null si chemin absent).
 */

import { ProviderUnavailableError, envPresent, fetchJson } from "./types";

// ─── Constantes ────────────────────────────────────────────────────────────────

const BASE_URL = "https://api.deepgram.com/v1/listen";

const DEFAULT_MODEL = "nova-3";
const DEFAULT_LANGUAGE = "fr";
const DEFAULT_MIMETYPE = "audio/wav";

// ─── isConfigured ──────────────────────────────────────────────────────────────

export function deepgramIsConfigured(): boolean {
  return envPresent("DEEPGRAM_API_KEY");
}

// ─── transcribeAudio ───────────────────────────────────────────────────────────

export interface TranscribeAudioOptions {
  mimetype?: string;
  model?: string;
  language?: string;
}

export interface TranscribeAudioResult {
  transcript: string;
  confidence: number | null;
}

/** Shape partielle de la réponse Deepgram (suffisant pour l'extraction). */
interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
      }>;
    }>;
  };
}

/**
 * Transcrit un buffer audio en texte via Deepgram.
 * Throw `ProviderUnavailableError` si la clé API est absente.
 */
export async function transcribeAudio(
  audio: Buffer,
  opts: TranscribeAudioOptions = {},
): Promise<TranscribeAudioResult> {
  if (!deepgramIsConfigured()) throw new ProviderUnavailableError("deepgram");

  const model = opts.model ?? DEFAULT_MODEL;
  const language = opts.language ?? DEFAULT_LANGUAGE;
  const mimetype = opts.mimetype ?? DEFAULT_MIMETYPE;

  const url = `${BASE_URL}?model=${encodeURIComponent(model)}&language=${encodeURIComponent(language)}&smart_format=true`;

  const data = await fetchJson<DeepgramResponse>(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY ?? ""}`,
      "Content-Type": mimetype,
    },
    body: audio as unknown as BodyInit,
  });

  // Extraction défensive — null si le chemin est absent ou vide.
  const alternative = data?.results?.channels?.[0]?.alternatives?.[0];
  const transcript = alternative?.transcript ?? "";
  const confidence = alternative?.confidence ?? null;

  return { transcript, confidence };
}
