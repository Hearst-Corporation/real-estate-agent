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
import { calculateCostUsd } from "@/lib/pricing/models";

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

/** Usage LLM optionnel à transmettre à Langfuse (tokens entrée/sortie). */
export interface TraceUsage {
  /** Tokens en entrée (prompt). */
  input: number;
  /** Tokens en sortie (completion). */
  output: number;
  /** Identifiant du modèle utilisé (optionnel). */
  model?: string;
}

/**
 * Helper minimal : ouvre une trace, renvoie un `end(output, usage?)` à appeler.
 * No-op si Langfuse non configuré.
 *
 * Si `usage` est passé à `end()`, les tokens/coûts sont enregistrés via une
 * génération enfant (seul niveau supportant `usage` dans l'API Langfuse).
 */
export function trace(
  name: string,
  input: unknown,
  metadata?: Record<string, unknown>,
): { end: (output: unknown, usage?: TraceUsage) => void } {
  const lf = getLangfuse();
  if (!lf) return { end: () => {} };
  const t = lf.trace({ name, input, metadata });
  return {
    end: (output: unknown, usage?: TraceUsage) => {
      t.update({ output });
      if (usage !== undefined) {
        // Coûts USD calculés depuis le barème modèle (no-op si modèle inconnu).
        const cost = usage.model
          ? calculateCostUsd(usage.model, usage.input, usage.output)
          : null;
        // Enregistre les tokens via une génération enfant (seul objet Langfuse
        // qui accepte `usage`/`costDetails` au niveau ingestion).
        const gen = t.generation({
          name: `${name}-generation`,
          model: usage.model,
          usage: {
            promptTokens: usage.input,
            completionTokens: usage.output,
            totalTokens: usage.input + usage.output,
          },
          // Coûts USD (clé `total` = somme, convention Langfuse).
          ...(cost ? { costDetails: { input: cost.input, output: cost.output, total: cost.total } } : {}),
        });
        gen.end();
      }
      void lf.flushAsync().catch(() => {});
    },
  };
}
