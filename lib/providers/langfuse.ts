/**
 * lib/providers/langfuse.ts — Observabilité LLM (traces, coûts, qualité).
 *
 * Wrappe les appels Claude (interview/estimation) et Kimi (chat Cockpit).
 * No-op total si les clés sont absentes → aucun crash en dev sans config.
 *
 *   langfuseIsConfigured() → boolean
 *   getLangfuse()          → Langfuse | null
 *   trace(name, input)     → helper minimal (start → end)
 */

import { Langfuse } from "langfuse";
import { envPresent } from "./types";

let client: Langfuse | null | undefined;

export function langfuseIsConfigured(): boolean {
  return envPresent("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY");
}

/** Singleton paresseux. null si non configuré. */
export function getLangfuse(): Langfuse | null {
  if (client !== undefined) return client;
  if (!langfuseIsConfigured()) {
    client = null;
    return null;
  }
  client = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_HOST || "https://cloud.langfuse.com",
  });
  return client;
}

/**
 * Helper minimal : ouvre une trace, renvoie un `end(output)` à appeler.
 * No-op si Langfuse non configuré.
 */
export function trace(
  name: string,
  input: unknown,
  metadata?: Record<string, unknown>,
): { end: (output: unknown) => void } {
  const lf = getLangfuse();
  if (!lf) return { end: () => {} };
  const t = lf.trace({ name, input, metadata });
  return {
    end: (output: unknown) => {
      t.update({ output });
      void lf.flushAsync().catch(() => {});
    },
  };
}
