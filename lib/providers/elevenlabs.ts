/**
 * lib/providers/elevenlabs.ts — ElevenLabs Text-to-Speech.
 *
 *   elevenLabsIsConfigured()    → boolean
 *   synthesizeSpeech(text, opts?) → Promise<Buffer>  (audio mp3 binaire)
 *
 * La réponse ElevenLabs est du binaire audio — on NE passe PAS par fetchJson.
 * Toute erreur HTTP est scrubée avant d'être propagée.
 */

import { ProviderUnavailableError, envPresent } from "./types";
import { scrubSecrets, safeUrl } from "./scrub";

// ─── Constantes ────────────────────────────────────────────────────────────────

const BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";

/** Voix Rachel — voix multilingue standard ElevenLabs. */
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

const DEFAULT_TIMEOUT_MS = 12_000;

// ─── isConfigured ──────────────────────────────────────────────────────────────

export function elevenLabsIsConfigured(): boolean {
  return envPresent("ELEVENLABS_API_KEY");
}

// ─── synthesizeSpeech ──────────────────────────────────────────────────────────

export interface SynthesizeSpeechOptions {
  voiceId?: string;
  modelId?: string;
}

/**
 * Synthétise `text` en audio mp3.
 * Retourne un Buffer binaire prêt à être streamé ou écrit.
 * Throw `ProviderUnavailableError` si la clé API est absente.
 */
export async function synthesizeSpeech(
  text: string,
  opts: SynthesizeSpeechOptions = {},
): Promise<Buffer> {
  if (!elevenLabsIsConfigured()) throw new ProviderUnavailableError("elevenlabs");

  const voiceId = opts.voiceId ?? DEFAULT_VOICE_ID;
  const modelId = opts.modelId ?? DEFAULT_MODEL_ID;
  const url = `${BASE_URL}/${voiceId}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "",
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: modelId }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `HTTP ${res.status} sur ${safeUrl(url)} — ${scrubSecrets(text).slice(0, 200)}`,
      );
    }

    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
