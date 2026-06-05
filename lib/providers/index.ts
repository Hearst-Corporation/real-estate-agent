/**
 * lib/providers/index.ts — Barrel des providers externes branchés.
 *
 * Tous fail-soft : vérifier xxxIsConfigured() avant d'appeler.
 * Tous lisent l'env paresseusement (jamais au module load).
 *
 * Statut de configuration runtime : providersStatus().
 */

export { ProviderUnavailableError } from "./types";

export { apolloIsConfigured, enrichPerson as apolloEnrich } from "./apollo";
export { pdlIsConfigured, enrichPerson as pdlEnrich } from "./pdl";
export {
  exaIsConfigured,
  exaSearch,
  tavilyIsConfigured,
  tavilySearch,
  perplexityIsConfigured,
  perplexityAnswer,
} from "./search";
export { llamaParseIsConfigured, parseDocument } from "./llamaparse";
export { langfuseIsConfigured, getLangfuse, trace } from "./langfuse";
export { embeddingsIsConfigured, embed, embedBatch } from "./embeddings";
export { composioIsConfigured, getComposio } from "./composio";
export { sentryIsConfigured } from "./sentry";
export { inngestIsConfigured } from "@/lib/jobs/inngest/client";

import { apolloIsConfigured } from "./apollo";
import { pdlIsConfigured } from "./pdl";
import { exaIsConfigured, tavilyIsConfigured, perplexityIsConfigured } from "./search";
import { llamaParseIsConfigured } from "./llamaparse";
import { langfuseIsConfigured } from "./langfuse";
import { embeddingsIsConfigured } from "./embeddings";
import { composioIsConfigured } from "./composio";
import { sentryIsConfigured } from "./sentry";
import { inngestIsConfigured } from "@/lib/jobs/inngest/client";

/** État de configuration de chaque provider (pour /api/health ou debug). */
export function providersStatus(): Record<string, boolean> {
  return {
    apollo: apolloIsConfigured(),
    pdl: pdlIsConfigured(),
    exa: exaIsConfigured(),
    tavily: tavilyIsConfigured(),
    perplexity: perplexityIsConfigured(),
    llamaparse: llamaParseIsConfigured(),
    langfuse: langfuseIsConfigured(),
    embeddings: embeddingsIsConfigured(),
    composio: composioIsConfigured(),
    sentry: sentryIsConfigured(),
    inngest: inngestIsConfigured(),
  };
}
