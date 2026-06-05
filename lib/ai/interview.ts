/**
 * lib/ai/interview.ts
 * Logique d'entretien immobilier — provider-agnostique (Kimi OpenAI / Anthropic).
 *
 * IMPORTANT — merge des tool_use :
 * Le merge de la donnée structurée se fait TOUJOURS sur le message complet
 * (tool_input parsé ou bloc tool_use Anthropic finalisé), JAMAIS sur des deltas
 * partiels non fiables. Ne pas tenter de parser du JSON partiel.
 */

import Anthropic from "@anthropic-ai/sdk";
import { kimi } from "@/lib/llm/kimi";
import { BLOCKS, DATA_GAPS } from "@/lib/estimation/spec";
import { recordPropertyDataTool } from "@/lib/estimation/tool-schema";
import { ToolInputSchema } from "@/lib/estimation/schema";
import type { PropertyData, FieldStatusMap } from "@/lib/estimation/types";
import { trace } from "@/lib/providers/langfuse";

// ─── Configuration ────────────────────────────────────────────────────────────

// Max tokens per interview turn — keeps responses conversational and within Cockpit limits.
const INTERVIEW_MAX_TOKENS = 1500;

export function anthropicIsConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.HYPERCLI_API_KEY);
}

/** True si au moins un provider LLM est disponible pour l'entretien. */
export function interviewIsConfigured(): boolean {
  const model = process.env.INTERVIEW_MODEL ?? "";
  if (model.startsWith("kimi") || !process.env.ANTHROPIC_API_KEY) {
    // Chemin Kimi/OpenAI — requiert MOONSHOT_API_KEY ou HYPERCLI_API_KEY
    return Boolean(
      process.env.MOONSHOT_API_KEY || process.env.HYPERCLI_API_KEY
    );
  }
  // Chemin Anthropic
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const INTERVIEW_MODEL =
  process.env.INTERVIEW_MODEL || "claude-opus-4-8";

/** Renvoie un client Anthropic (chemin Anthropic uniquement). */
export function getInterviewClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ─── System prompt ────────────────────────────────────────────────────────────

/**
 * Construit le system prompt statique (cacheable).
 */
export function buildSystemPrompt(): string {
  const blocksText = BLOCKS.map((b) => {
    const qs = b.questions.map((q) => `  - [${q.id}] ${q.label}`).join("\n");
    return `### Bloc ${b.index} — ${b.title}\n${b.intro}\n${qs}`;
  }).join("\n\n");

  const gapsText = DATA_GAPS.map(
    (g) => `  - ${g.field} (impact ${g.impact}) : ${g.action}`
  ).join("\n");

  return `Tu es un expert immobilier pédagogue, orienté action. Tu conduis un entretien structuré pour estimer un bien immobilier résidentiel ou commercial. Tu parles uniquement en français.

## RÈGLES DURES

1. **3 à 5 questions maximum par message** — ne dépasse jamais cette limite.
2. **Récapitulatif + confirmation après CHAQUE bloc** : à la fin d'un bloc, résume les informations collectées en quelques lignes et demande au vendeur de confirmer avant de passer au bloc suivant.
3. **Donnée inconnue** : si le vendeur ne connaît pas une information, appelle \`record_property_data\` en ajoutant le nom du champ dans \`to_confirm[]\` (ne mets PAS le champ dans la réponse) et CONTINUE l'entretien — ne bloque jamais.
4. **Ne jamais inventer** une valeur que le vendeur n'a pas fournie. En cas de doute, mets le champ dans \`to_confirm[]\`.
5. **Appeler l'outil à chaque tour** où une information a été apprise, même partielle.
6. **Toute estimation** doit être exprimée en fourchette chiffrée (ex : "entre 8 000 € et 9 500 €/m²"), jamais comme valeur unique.
7. **Progression bloc par bloc** : respecte l'ordre des 9 blocs. Ne saute pas de bloc, mais tu peux regrouper des questions proches.

## LES 9 BLOCS D'ENTRETIEN

${blocksText}

## TABLE D'IMPACTS — DONNÉES CRITIQUES

Les champs suivants ont un impact fort ou moyen sur la valorisation :
${gapsText}

Quand ces champs sont inconnus, signale l'incertitude dans ton récapitulatif et continue.`;
}

// ─── Agnostic stream turn ─────────────────────────────────────────────────────

type Message = { role: "user" | "assistant"; content: string };

interface StreamInterviewTurnParams {
  system: string;
  history: Message[];
  stateHeader: string;
  userMessage: string;
  onText: (delta: string) => void;
}

interface StreamInterviewTurnResult {
  assistantText: string;
  toolInput: unknown | null;
  stopReason: string;
}

/**
 * Lance un tour d'entretien en streaming, provider-agnostique.
 *
 * Choix du provider :
 *   - INTERVIEW_MODEL commence par "kimi" → chemin OpenAI/Kimi (Moonshot ou Hypercli)
 *   - Pas d'ANTHROPIC_API_KEY → chemin OpenAI/Kimi
 *   - Sinon → chemin Anthropic
 *
 * onText : callback appelé pour chaque delta de texte.
 * Retourne : { assistantText, toolInput (null si absent/tronqué), stopReason }.
 */
export async function streamInterviewTurn(
  params: StreamInterviewTurnParams
): Promise<StreamInterviewTurnResult> {
  const { system, history, stateHeader, userMessage, onText } = params;
  const model = process.env.INTERVIEW_MODEL ?? INTERVIEW_MODEL;
  const useKimi =
    model.startsWith("kimi") || !process.env.ANTHROPIC_API_KEY;

  // Observabilité Langfuse — no-op si non configuré, jamais bloquant.
  let t: { end: (output: unknown) => void } = { end: () => {} };
  try {
    t = trace(
      "interview-turn",
      { model, userMessage: params.userMessage },
      { provider: useKimi ? "kimi" : "anthropic", model },
    );
  } catch {
    // trace() ne doit jamais faire planter le tour — on retombe sur le no-op.
  }

  let result: StreamInterviewTurnResult | null = null;
  try {
    if (useKimi) {
      result = await _streamKimiTurn({ system, history, stateHeader, userMessage, onText, model });
    } else {
      result = await _streamAnthropicTurn({ system, history, stateHeader, userMessage, onText });
    }
    return result;
  } finally {
    t.end({
      stopReason: result?.stopReason,
      hasToolInput: result?.toolInput !== null && result?.toolInput !== undefined,
      assistantTextLength: result?.assistantText?.length ?? 0,
    });
  }
}

// ─── Kimi / OpenAI path ───────────────────────────────────────────────────────

/** OpenAI tool format converted from Anthropic recordPropertyDataTool */
const openAiRecordPropertyDataTool = {
  type: "function" as const,
  function: {
    name: recordPropertyDataTool.name,
    description: recordPropertyDataTool.description,
    parameters: recordPropertyDataTool.input_schema,
  },
};

async function _streamKimiTurn(params: {
  system: string;
  history: Message[];
  stateHeader: string;
  userMessage: string;
  onText: (delta: string) => void;
  model: string;
}): Promise<StreamInterviewTurnResult> {
  const { system, history, stateHeader, userMessage, onText, model } = params;

  const userContent = stateHeader
    ? `${stateHeader}\n\n${userMessage}`
    : userMessage;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userContent },
  ];

  const completion = await kimi.chat.completions.create({
    model,
    stream: true,
    max_tokens: INTERVIEW_MAX_TOKENS,
    messages,
    tools: [openAiRecordPropertyDataTool],
    tool_choice: "auto",
  });

  let assistantText = "";
  let toolArgsBuffer = "";
  let stopReason = "end_turn";

  for await (const chunk of completion) {
    const choice = chunk.choices?.[0];
    if (!choice) continue;

    // Text delta
    const textDelta = choice.delta?.content ?? "";
    if (textDelta) {
      assistantText += textDelta;
      onText(textDelta);
    }

    // Tool call arguments accumulation
    const toolCalls = (choice.delta as { tool_calls?: Array<{ function?: { arguments?: string } }> })?.tool_calls;
    if (toolCalls) {
      for (const tc of toolCalls) {
        if (tc.function?.arguments) {
          toolArgsBuffer += tc.function.arguments;
        }
      }
    }

    if (choice.finish_reason) {
      // OpenAI uses "length" for truncation, "tool_calls" for tool use, "stop" for normal end
      stopReason = choice.finish_reason;
    }
  }

  // Parse tool input — only if not truncated
  let toolInput: unknown | null = null;
  if (stopReason !== "length" && toolArgsBuffer) {
    try {
      toolInput = JSON.parse(toolArgsBuffer);
    } catch {
      toolInput = null;
    }
  }

  return { assistantText, toolInput, stopReason };
}

// ─── Anthropic path ───────────────────────────────────────────────────────────

async function _streamAnthropicTurn(params: {
  system: string;
  history: Message[];
  stateHeader: string;
  userMessage: string;
  onText: (delta: string) => void;
}): Promise<StreamInterviewTurnResult> {
  const { system, history, stateHeader, userMessage, onText } = params;

  const client = getInterviewClient();

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user" as const,
      content: stateHeader ? `${stateHeader}\n\n${userMessage}` : userMessage,
    },
  ];

  const stream = client.messages.stream({
    model: INTERVIEW_MODEL,
    max_tokens: INTERVIEW_MAX_TOKENS,
    system: [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [recordPropertyDataTool],
    tool_choice: { type: "auto" },
    messages,
  });

  stream.on("text", onText);

  const finalMessage = await stream.finalMessage();
  const stopReason = finalMessage.stop_reason ?? "end_turn";
  const isTruncated = stopReason === "max_tokens";

  const toolUseBlock = isTruncated
    ? null
    : finalMessage.content.find(
        (b): b is Extract<typeof b, { type: "tool_use" }> =>
          b.type === "tool_use" && b.name === "record_property_data"
      ) ?? null;

  let assistantText = "";
  for (const block of finalMessage.content) {
    if (block.type === "text") assistantText += block.text;
  }

  return {
    assistantText,
    toolInput: toolUseBlock ? toolUseBlock.input : null,
    stopReason,
  };
}

// ─── Legacy Anthropic helpers (kept for backward compat) ─────────────────────

interface RunInterviewTurnParams {
  client: Anthropic;
  system: string;
  history: Message[];
  stateHeader: string;
  userMessage: string;
}

/**
 * @deprecated Utiliser streamInterviewTurn à la place.
 * Conservé pour la compatibilité avec d'anciens appelants éventuels.
 */
export function runInterviewTurn({
  client,
  system,
  history,
  stateHeader,
  userMessage,
}: RunInterviewTurnParams) {
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: "user" as const,
      content: stateHeader ? `${stateHeader}\n\n${userMessage}` : userMessage,
    },
  ];

  return client.messages.stream({
    model: INTERVIEW_MODEL,
    max_tokens: INTERVIEW_MAX_TOKENS,
    system: [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [recordPropertyDataTool],
    tool_choice: { type: "auto" },
    messages,
  });
}

// ─── Merge tool input ─────────────────────────────────────────────────────────

/**
 * Valide et merge le tool_input dans la copie de property + fieldStatus.
 *
 * Stratégie :
 * - Valide via ToolInputSchema.safeParse (non fiable car généré par le LLM).
 * - Assigne les clés définies (hors to_confirm / current_block) sur une copie de property.
 * - Pour chaque clé dans to_confirm → fieldStatus[k] = "to_confirm".
 * - Pour chaque clé apprise (présente dans le toolInput) → fieldStatus[k] = "answered".
 *
 * IMPORTANT : appeler UNIQUEMENT sur un tool_input complet (jamais sur des deltas partiels).
 */
export function mergeToolInput(
  property: PropertyData,
  fieldStatus: FieldStatusMap,
  toolInput: unknown
): { property: PropertyData; fieldStatus: FieldStatusMap } {
  const parsed = ToolInputSchema.safeParse(toolInput);
  if (!parsed.success) {
    // LLM a émis un tool_input invalide — on ignore silencieusement.
    return { property: { ...property }, fieldStatus: { ...fieldStatus } };
  }

  const input = parsed.data;
  const newProperty = { ...property } as Record<string, unknown>;
  const newFieldStatus: FieldStatusMap = { ...fieldStatus };

  // Clés à ignorer lors de l'assign sur property
  const META_KEYS = new Set<string>(["to_confirm", "current_block"]);

  for (const [key, value] of Object.entries(input)) {
    if (META_KEYS.has(key)) continue;
    if (value === undefined) continue;
    newProperty[key] = value;
    // Marque comme answered (écrase un éventuel to_confirm précédent)
    newFieldStatus[key as keyof PropertyData] = "answered";
  }

  // Champs que le vendeur ne connaît pas → to_confirm
  for (const k of input.to_confirm ?? []) {
    // N'écrase pas "answered" si la clé vient d'être apprise ce tour
    if (newFieldStatus[k as keyof PropertyData] !== "answered") {
      newFieldStatus[k as keyof PropertyData] = "to_confirm";
    }
  }

  return {
    property: newProperty as PropertyData,
    fieldStatus: newFieldStatus,
  };
}
