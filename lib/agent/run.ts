/**
 * lib/agent/run.ts — Boucle agentique multi-tours sur OpenAI (function-calling natif).
 *
 * À chaque tour, le modèle peut appeler des outils (`tool_calls` OpenAI) ; on les
 * exécute, on émet des frames (text/tool/action) et on reboucle jusqu'à `maxSteps`
 * ou jusqu'à ce que le modèle s'arrête sans demander d'outil.
 *
 * L'exécution des outils se fait TOUJOURS sur des appels finalisés (arguments JSON
 * entièrement bufferisés), jamais sur des deltas partiels.
 *
 * Sécurité :
 *  - Les résultats de tools sont renvoyés comme messages `role:"tool"` (données),
 *    jamais comme instructions système → barrière contre l'injection de prompt.
 *  - Fallback modèle sur indispo/rate-limit/timeout (OPENAI_CHAT_FALLBACK_MODEL).
 *  - AbortSignal propagé à chaque appel : l'annulation client coupe le stream.
 */

import type OpenAI from "openai";
import {
  completionTokenParam,
  getOpenAiClient,
  normalizeOpenAiError,
  openAiErrorMessage,
  OPENAI_CHAT_FALLBACK_MODEL,
  shouldFallback,
  type OpenAiErrorCode,
} from "@/lib/llm/openai";
import { ALL_TOOLS, getTool } from "@/lib/agent/tools/registry";
import type { AgentTool, ToolContext } from "@/lib/agent/types";
import type { TraceUsage } from "@/lib/providers/langfuse";

// ─── Configuration ──────────────────────────────────────────────────────────

/** Plafond de tokens par tour LLM (réponse visible + arguments d'outils). */
const AGENT_MAX_TOKENS = 4096;
/** Nombre de tours d'outils par défaut avant arrêt forcé de la boucle. */
const DEFAULT_MAX_STEPS = 12;
/** Observation de repli quand un outil ne renvoie aucun texte (tool_result jamais vide). */
const EMPTY_OBSERVATION_FALLBACK = "(aucun résultat)";

type ChatMessage = { role: "user" | "assistant"; content: string };

interface RunAgentParams {
  model: string;
  system: string;
  history: ChatMessage[];
  userMessage: string;
  ctx: ToolContext;
  maxSteps?: number;
  /** Signal d'annulation lié à la requête HTTP : coupe le stream si le client part. */
  signal?: AbortSignal;
}

interface RunAgentResult {
  /** Texte visible cumulé sur tous les tours (à persister comme message assistant). */
  assistantText: string;
  /** Usage tokens cumulé. */
  usage?: TraceUsage;
  /** Code d'erreur normalisé si la génération a échoué (sans secret). */
  errorCode?: OpenAiErrorCode;
}

// ─── Conversion des outils vers le format OpenAI ────────────────────────────

function toOpenAiTool(t: AgentTool): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  };
}

// ─── Exécution d'un outil + émission des frames ─────────────────────────────

/**
 * Exécute un outil par nom et émet les frames tool (running → ok/error) + action.
 * Renvoie l'observation textuelle à renvoyer au LLM comme tool_result.
 *
 * Les tools de MUTATION appliquent eux-mêmes leur garde de confirmation
 * (`confirmed=true` requis) : le moteur n'exécute jamais une mutation « en douce ».
 */
async function runToolCall(
  toolUseId: string,
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  ctx.emit({ type: "tool", id: toolUseId, name, status: "running", summary: `${name}…` });

  const tool = getTool(name);
  if (!tool) {
    ctx.emit({ type: "tool", id: toolUseId, name, status: "error", summary: `Outil inconnu : ${name}` });
    return `Outil « ${name} » inconnu.`;
  }

  try {
    const result = await tool.execute(rawArgs, ctx);
    ctx.emit({
      type: "tool",
      id: toolUseId,
      name,
      status: result.ok ? "ok" : "error",
      summary: result.summary,
    });
    if (result.action) ctx.emit({ type: "action", action: result.action });
    return result.observation;
  } catch {
    ctx.emit({ type: "tool", id: toolUseId, name, status: "error", summary: `Échec de ${name}` });
    return `L'outil « ${name} » a échoué de façon inattendue.`;
  }
}

// ─── Chemin OpenAI (function-calling natif, streaming) ──────────────────────

interface AccumulatedToolCall {
  id: string;
  name: string;
  args: string;
}

interface TurnStreamResult {
  /** Appels d'outils finalisés (id + name non vides). */
  calls: AccumulatedToolCall[];
  /** Texte visible produit ce tour (pour le message assistant sortant). */
  content: string;
  inputTokens: number;
  outputTokens: number;
  sawUsage: boolean;
}

/**
 * Un tour de stream OpenAI : émet les deltas de texte via `ctx.emit` et
 * accumule les tool_calls. Bascule sur le modèle de repli si le principal
 * échoue avec une erreur transitoire.
 */
async function streamTurn(
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  toolChoice: "auto" | "none",
  ctx: ToolContext,
  signal: AbortSignal | undefined,
): Promise<TurnStreamResult> {
  const client = getOpenAiClient();

  const attempt = async (m: string): Promise<TurnStreamResult> => {
    const stream = await client.chat.completions.create(
      {
        model: m,
        stream: true,
        stream_options: { include_usage: true },
        ...completionTokenParam(m, AGENT_MAX_TOKENS),
        messages,
        ...(toolChoice === "none"
          ? { tool_choice: "none" as const }
          : { tools, tool_choice: "auto" as const }),
      },
      { signal },
    );

    let content = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let sawUsage = false;
    const toolCalls: Record<number, AccumulatedToolCall> = {};

    for await (const chunk of stream) {
      if (chunk.usage) {
        inputTokens += chunk.usage.prompt_tokens;
        outputTokens += chunk.usage.completion_tokens;
        sawUsage = true;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        ctx.emit({ type: "text", delta: delta.content });
      }

      for (const tc of delta.tool_calls ?? []) {
        const idx = tc.index;
        const acc = (toolCalls[idx] ??= { id: "", name: "", args: "" });
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name = tc.function.name;
        if (tc.function?.arguments) acc.args += tc.function.arguments;
      }
    }

    // Ne garde que les appels finalisés : `id` + `name` non vides.
    const calls = Object.keys(toolCalls)
      .map((k) => Number(k))
      .sort((a, b) => a - b)
      .map((k) => toolCalls[k])
      .filter((c) => c.id.trim() !== "" && c.name.trim() !== "");

    return { calls, content, inputTokens, outputTokens, sawUsage };
  };

  try {
    return await attempt(model);
  } catch (err) {
    const norm = normalizeOpenAiError(err);
    // Annulation client : ne pas retenter, propager tel quel.
    if (norm.code === "aborted") throw norm;
    // Si aucun texte n'a encore été streamé et l'erreur est transitoire, on
    // retente sur le modèle de repli (une seule fois).
    if (shouldFallback(norm.code) && model !== OPENAI_CHAT_FALLBACK_MODEL) {
      return await attempt(OPENAI_CHAT_FALLBACK_MODEL);
    }
    throw norm;
  }
}

async function runOpenAi(params: RunAgentParams, maxSteps: number): Promise<RunAgentResult> {
  const { model, system, history, userMessage, ctx, signal } = params;
  const tools = ALL_TOOLS.map(toOpenAiTool);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...history.map(
      (m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam,
    ),
    { role: "user", content: userMessage },
  ];

  let assistantText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let sawUsage = false;
  // Vrai si le dernier tour a poussé des messages tool jamais « vus » par le modèle.
  let pendingToolResults = false;

  for (let step = 0; step < maxSteps; step++) {
    const turn = await streamTurn(model, messages, tools, "auto", ctx, signal);
    assistantText += turn.content;
    inputTokens += turn.inputTokens;
    outputTokens += turn.outputTokens;
    sawUsage = sawUsage || turn.sawUsage;

    // Aucun appel valide → réponse texte finale, on s'arrête.
    if (turn.calls.length === 0) {
      pendingToolResults = false;
      break;
    }

    // Pousse le message assistant porteur des tool_calls, puis un message tool par appel.
    messages.push({
      role: "assistant",
      content: turn.content || null,
      tool_calls: turn.calls.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.name, arguments: c.args || "{}" },
      })),
    });

    for (const c of turn.calls) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = c.args ? (JSON.parse(c.args) as Record<string, unknown>) : {};
      } catch {
        parsed = {};
      }
      const observation = await runToolCall(c.id, c.name, parsed, ctx);
      const safeContent = observation?.trim() ? observation : EMPTY_OBSERVATION_FALLBACK;
      // Résultat de tool = DONNÉE (role:"tool"), jamais une instruction système.
      messages.push({ role: "tool", tool_call_id: c.id, content: safeContent });
    }
    pendingToolResults = true;
  }

  // Sortie par épuisement de maxSteps avec des messages tool jamais synthétisés :
  // un dernier appel SANS outils pour produire la phrase de synthèse.
  if (pendingToolResults) {
    try {
      const finalTurn = await streamTurn(model, messages, tools, "none", ctx, signal);
      assistantText += finalTurn.content;
      inputTokens += finalTurn.inputTokens;
      outputTokens += finalTurn.outputTokens;
      sawUsage = sawUsage || finalTurn.sawUsage;
    } catch {
      // synthèse best-effort : les outils ont déjà réussi, on n'émet pas d'erreur globale
    }
  }

  return {
    assistantText,
    usage: sawUsage ? { input: inputTokens, output: outputTokens, model } : undefined,
  };
}

// ─── Entrée publique ────────────────────────────────────────────────────────

/**
 * Lance la boucle agentique OpenAI. Streame texte + frames d'outils via `ctx.emit`.
 * Ne jette jamais : en cas d'erreur LLM, émet une note d'erreur normalisée
 * (sans secret ni détail interne) et termine.
 */
export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const maxSteps = params.maxSteps ?? DEFAULT_MAX_STEPS;

  try {
    return await runOpenAi(params, maxSteps);
  } catch (err) {
    const norm = normalizeOpenAiError(err);
    // Annulation client : silencieuse (le flux est déjà coupé), pas de note d'erreur.
    if (norm.code === "aborted") {
      return { assistantText: "", errorCode: "aborted" };
    }
    console.error("[cockpit-agent] échec de génération:", norm.code);
    // Message clair selon la cause (quota épuisé, rate-limit, modèle indispo…),
    // émis en frame `error` (pas `text`) pour ne pas le persister comme réponse
    // de l'assistant. L'utilisateur sait pourquoi ça n'a pas répondu.
    params.ctx.emit({ type: "error", message: openAiErrorMessage(norm.code) });
    return { assistantText: "", errorCode: norm.code };
  }
}
