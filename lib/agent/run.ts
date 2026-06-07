/**
 * lib/agent/run.ts — Boucle agentique multi-tours, provider-agnostique.
 *
 * Réplique les conventions de lib/ai/interview.ts (streaming, tool_use Anthropic,
 * tool_calls Kimi/OpenAI, trace Langfuse). À chaque tour, le LLM peut appeler des
 * outils ; on les exécute, on émet des frames (text/tool/action) et on reboucle
 * jusqu'à `maxSteps` ou jusqu'à ce que le LLM s'arrête sans demander d'outil.
 *
 * Le merge / l'exécution des outils se fait TOUJOURS sur des appels finalisés
 * (tool_use Anthropic complet ou arguments JSON Kimi entièrement bufferisés),
 * jamais sur des deltas partiels.
 */

import Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { kimi } from "@/lib/llm/kimi";
import { usesKimiPath } from "@/lib/ai/interview";
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
}

interface RunAgentResult {
  /** Texte visible cumulé sur tous les tours (à persister comme message assistant). */
  assistantText: string;
  /** Usage tokens (uniquement sur le chemin Anthropic, cumulé). */
  usage?: TraceUsage;
}

// ─── Conversion des outils vers chaque format provider ──────────────────────

function toAnthropicTool(t: AgentTool): Anthropic.Tool {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  };
}

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

// ─── Chemin Anthropic ───────────────────────────────────────────────────────

async function runAnthropic(params: RunAgentParams, maxSteps: number): Promise<RunAgentResult> {
  const { model, system, history, userMessage, ctx } = params;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const tools = ALL_TOOLS.map(toAnthropicTool);

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  let assistantText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  // Vrai si le dernier tour a poussé des tool_result jamais « vus » par le modèle.
  let pendingToolResults = false;

  for (let step = 0; step < maxSteps; step++) {
    const stream = client.messages.stream({
      model,
      max_tokens: AGENT_MAX_TOKENS,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools,
      tool_choice: { type: "auto" },
      messages,
    });

    stream.on("text", (delta) => {
      assistantText += delta;
      ctx.emit({ type: "text", delta });
    });

    const finalMessage = await stream.finalMessage();
    if (finalMessage.usage) {
      inputTokens += finalMessage.usage.input_tokens;
      outputTokens += finalMessage.usage.output_tokens;
    }

    if (finalMessage.stop_reason !== "tool_use") {
      pendingToolResults = false;
      break;
    }

    const toolUseBlocks = finalMessage.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (toolUseBlocks.length === 0) {
      pendingToolResults = false;
      break;
    }

    // Pousse la réponse de l'assistant (texte + tool_use) puis les tool_result.
    messages.push({ role: "assistant", content: finalMessage.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const observation = await runToolCall(
        block.id,
        block.name,
        (block.input ?? {}) as Record<string, unknown>,
        ctx,
      );
      const safeContent = observation && observation.trim() ? observation : EMPTY_OBSERVATION_FALLBACK;
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: safeContent });
    }
    messages.push({ role: "user", content: toolResults });
    pendingToolResults = true;
  }

  // Sortie par épuisement de maxSteps avec des tool_result jamais synthétisés :
  // un dernier appel SANS outils pour produire la phrase de synthèse.
  if (pendingToolResults) {
    try {
      const finalStream = client.messages.stream({
        model,
        max_tokens: AGENT_MAX_TOKENS,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
      });

      finalStream.on("text", (delta) => {
        assistantText += delta;
        ctx.emit({ type: "text", delta });
      });

      const finalSynthesis = await finalStream.finalMessage();
      if (finalSynthesis.usage) {
        inputTokens += finalSynthesis.usage.input_tokens;
        outputTokens += finalSynthesis.usage.output_tokens;
      }
    } catch {
      // synthèse best-effort : les outils ont déjà réussi, on n'émet pas d'erreur globale
    }
  }

  return {
    assistantText,
    usage: { input: inputTokens, output: outputTokens, model },
  };
}

// ─── Chemin Kimi / OpenAI ───────────────────────────────────────────────────

interface AccumulatedToolCall {
  id: string;
  name: string;
  args: string;
}

async function runKimi(params: RunAgentParams, maxSteps: number): Promise<RunAgentResult> {
  const { model, system, history, userMessage, ctx } = params;
  const tools = ALL_TOOLS.map(toOpenAiTool);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
    { role: "user", content: userMessage },
  ];

  let assistantText = "";
  // Vrai si le dernier tour a poussé des messages tool jamais « vus » par le modèle.
  let pendingToolResults = false;

  for (let step = 0; step < maxSteps; step++) {
    const stream = await kimi.chat.completions.create({
      model,
      stream: true,
      max_tokens: AGENT_MAX_TOKENS,
      messages,
      tools,
      tool_choice: "auto",
    });

    let content = "";
    // Indexées par `index` du delta (l'ordre des tool_calls dans le flux).
    const toolCalls: Record<number, AccumulatedToolCall> = {};

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        assistantText += delta.content;
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

    // Ne garde que les appels finalisés et valides : `id` + `name` non vides.
    // L'API OpenAI/Moonshot rejette un function.name vide au tour suivant.
    const calls = Object.keys(toolCalls)
      .map((k) => Number(k))
      .sort((a, b) => a - b)
      .map((k) => toolCalls[k])
      .filter((c) => c.id.trim() !== "" && c.name.trim() !== "");

    // Aucun appel valide → on traite ce tour comme une réponse texte et on s'arrête,
    // en gardant le texte déjà streamé.
    if (calls.length === 0) {
      pendingToolResults = false;
      break;
    }

    // Pousse le message assistant porteur des tool_calls, puis un message tool par appel.
    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.name, arguments: c.args || "{}" },
      })),
    });

    for (const c of calls) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = c.args ? (JSON.parse(c.args) as Record<string, unknown>) : {};
      } catch {
        parsed = {};
      }
      const observation = await runToolCall(c.id, c.name, parsed, ctx);
      const safeContent = observation && observation.trim() ? observation : EMPTY_OBSERVATION_FALLBACK;
      messages.push({ role: "tool", tool_call_id: c.id, content: safeContent });
    }
    pendingToolResults = true;
  }

  // Sortie par épuisement de maxSteps avec des messages tool jamais synthétisés :
  // un dernier appel SANS outils pour produire la phrase de synthèse.
  if (pendingToolResults) {
    try {
      const finalStream = await kimi.chat.completions.create({
        model,
        stream: true,
        max_tokens: AGENT_MAX_TOKENS,
        messages,
        tool_choice: "none",
      });

      for await (const chunk of finalStream) {
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          assistantText += delta.content;
          ctx.emit({ type: "text", delta: delta.content });
        }
      }
    } catch {
      // synthèse best-effort : les outils ont déjà réussi, on n'émet pas d'erreur globale
    }
  }

  // Kimi ne remonte pas l'usage de façon fiable en stream → pas d'usage.
  return { assistantText };
}

// ─── Entrée publique ────────────────────────────────────────────────────────

/**
 * Lance la boucle agentique. Streame texte + frames d'outils via `ctx.emit`.
 * Ne jette jamais : en cas d'erreur LLM, émet une note d'erreur et termine.
 */
export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const maxSteps = params.maxSteps ?? DEFAULT_MAX_STEPS;
  const useKimi = usesKimiPath(params.model);

  try {
    return useKimi ? await runKimi(params, maxSteps) : await runAnthropic(params, maxSteps);
  } catch (err) {
    console.error("[cockpit-agent] échec de génération:", err instanceof Error ? err.message : String(err));
    const note = "\n[Erreur de génération]";
    params.ctx.emit({ type: "text", delta: note });
    return { assistantText: note };
  }
}
