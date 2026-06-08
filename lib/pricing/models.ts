/**
 * lib/pricing/models.ts — Matrice de coûts des modèles LLM (USD / 1M tokens).
 *
 * Source de vérité unique pour la facturation observabilité (Langfuse `costDetails`).
 * Les tarifs sont exprimés par MILLION de tokens, séparés entrée / sortie.
 *
 *   MODEL_PRICING                          → barème par modèle
 *   calculateCostUsd(model, in, out)       → { input, output, total } en USD
 *
 * Matching tolérant (normalise + startsWith) : un id versionné ou préfixé d'un
 * provider (`anthropic/…`, `us.anthropic.…`, suffixe date) retombe sur la bonne
 * entrée. Modèle inconnu → coûts 0 (jamais de throw).
 */

/** Tarif d'un modèle, en USD par million de tokens. */
export interface ModelPricing {
  /** Coût des tokens d'entrée (prompt), USD / 1M tokens. */
  inputPerM: number;
  /** Coût des tokens de sortie (completion), USD / 1M tokens. */
  outputPerM: number;
}

/** Diviseur : les tarifs sont exprimés par million de tokens. */
const TOKENS_PER_MILLION = 1_000_000;

/**
 * Barème 2026 (USD / 1M tokens). Clés normalisées (minuscules, sans préfixe
 * provider). Mettre à jour ici uniquement — aucun tarif ne vit ailleurs.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-8": { inputPerM: 15, outputPerM: 75 },
  "claude-sonnet-4-6": { inputPerM: 3, outputPerM: 15 },
  "claude-haiku-4-5": { inputPerM: 1, outputPerM: 5 },
  // Kimi K2.6 (Moonshot / Hypercli) : estimation prudente, à ajuster selon la
  // grille tarifaire réelle du provider effectif (Moonshot ou Hypercli).
  "kimi-k2.6": { inputPerM: 0.6, outputPerM: 2.5 },
};

/** Coût détaillé d'un appel, en USD. */
export interface CostBreakdown {
  /** Coût des tokens d'entrée, USD. */
  input: number;
  /** Coût des tokens de sortie, USD. */
  output: number;
  /** Somme entrée + sortie, USD. */
  total: number;
}

/** Normalise un id de modèle : minuscules, sans préfixe provider ni espaces. */
function normalizeModelId(model: string): string {
  return model
    .trim()
    .toLowerCase()
    // Retire un éventuel préfixe provider (`anthropic/`, `us.anthropic.`, `moonshot/`…).
    .replace(/^[a-z0-9.-]+\//, "")
    .replace(/^(?:us|eu|apac)\.anthropic\./, "");
}

/**
 * Résout le barème d'un modèle avec matching tolérant :
 *   1. correspondance exacte sur l'id normalisé,
 *   2. sinon, première clé du barème dont l'id normalisé est un préfixe
 *      (gère les suffixes de version/date : `claude-opus-4-8-20260101`).
 * Renvoie null si rien ne correspond.
 */
function resolvePricing(model: string): ModelPricing | null {
  const normalized = normalizeModelId(model);
  if (MODEL_PRICING[normalized]) return MODEL_PRICING[normalized];
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (normalized.startsWith(key) || key.startsWith(normalized)) return pricing;
  }
  return null;
}

/**
 * Calcule le coût d'un appel LLM en USD à partir des tokens consommés.
 * Modèle inconnu ou tokens invalides → coûts 0 (ne jette jamais).
 */
export function calculateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): CostBreakdown {
  const pricing = resolvePricing(model);
  if (!pricing) return { input: 0, output: 0, total: 0 };

  const safeIn = Number.isFinite(inputTokens) && inputTokens > 0 ? inputTokens : 0;
  const safeOut = Number.isFinite(outputTokens) && outputTokens > 0 ? outputTokens : 0;

  const input = (safeIn / TOKENS_PER_MILLION) * pricing.inputPerM;
  const output = (safeOut / TOKENS_PER_MILLION) * pricing.outputPerM;
  return { input, output, total: input + output };
}
