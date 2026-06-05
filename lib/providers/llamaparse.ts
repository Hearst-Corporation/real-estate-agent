/**
 * lib/providers/llamaparse.ts — LlamaParse : PDF/DOCX → Markdown.
 *
 * Usage immo : extraire le texte structuré d'un mandat, d'un DPE, d'un
 * diagnostic technique ou d'un compromis pour le feeder au LLM d'estimation.
 *
 *   llamaParseIsConfigured()                 → boolean
 *   parseDocument(buffer, filename)          → string (markdown)
 *
 * Flux async LlamaParse : upload → job id → poll status → fetch result.
 */

import { ProviderUnavailableError, envPresent, fetchJson } from "./types";

const BASE = "https://api.cloud.llamaindex.ai/api/parsing";
const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 30; // ~60 s max

export function llamaParseIsConfigured(): boolean {
  return envPresent("LLAMA_CLOUD_API_KEY");
}

export async function parseDocument(
  file: Buffer | Uint8Array,
  filename: string,
): Promise<string> {
  if (!llamaParseIsConfigured()) throw new ProviderUnavailableError("llamaparse");
  const key = process.env.LLAMA_CLOUD_API_KEY!;
  const auth = { Authorization: `Bearer ${key}` };

  // 1. Upload
  const form = new FormData();
  form.append("file", new Blob([file as BlobPart]), filename);
  const upload = await fetchJson<{ id: string }>(`${BASE}/upload`, {
    method: "POST",
    headers: auth,
    body: form,
  });

  // 2. Poll
  for (let i = 0; i < MAX_POLLS; i++) {
    const status = await fetchJson<{ status: string }>(
      `${BASE}/job/${upload.id}`,
      { headers: auth },
    );
    if (status.status === "SUCCESS") break;
    if (status.status === "ERROR") throw new Error(`LlamaParse job ${upload.id} a échoué`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // 3. Result (markdown)
  const result = await fetchJson<{ markdown: string }>(
    `${BASE}/job/${upload.id}/result/markdown`,
    { headers: auth },
  );
  return result.markdown ?? "";
}
