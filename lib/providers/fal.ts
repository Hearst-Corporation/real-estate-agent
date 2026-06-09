/**
 * lib/providers/fal.ts — Génération d'image via fal.ai (Flux).
 *
 * Use cases immo : mockups de biens, illustrations brochure, home-staging virtuel.
 *
 *   falIsConfigured()                  → boolean
 *   generateImage(prompt, opts?)       → { imageUrl, width, height }
 */

import { ProviderUnavailableError, envPresent, fetchJson } from "./types";

const FAL_BASE_URL = "https://fal.run";
const DEFAULT_FAL_MODEL = "fal-ai/flux/dev";
const DEFAULT_IMAGE_SIZE = "landscape_4_3";

export interface FalImageResult {
  imageUrl: string;
  width: number | null;
  height: number | null;
}

export function falIsConfigured(): boolean {
  return envPresent("FAL_KEY");
}

/** Génère une image via Flux (fal.ai). Throw si non configuré. */
export async function generateImage(
  prompt: string,
  opts?: { imageSize?: string; model?: string },
): Promise<FalImageResult> {
  if (!falIsConfigured()) throw new ProviderUnavailableError("fal");

  const model = opts?.model ?? DEFAULT_FAL_MODEL;
  const imageSize = opts?.imageSize ?? DEFAULT_IMAGE_SIZE;
  const url = `${FAL_BASE_URL}/${model}`;

  const data = await fetchJson<{
    images?: Array<{ url?: unknown; width?: unknown; height?: unknown }>;
  }>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${process.env.FAL_KEY ?? ""}`,
    },
    body: JSON.stringify({ prompt, image_size: imageSize }),
  });

  const first = Array.isArray(data.images) ? data.images[0] : undefined;

  return {
    imageUrl: typeof first?.url === "string" ? first.url : "",
    width: typeof first?.width === "number" ? first.width : null,
    height: typeof first?.height === "number" ? first.height : null,
  };
}
