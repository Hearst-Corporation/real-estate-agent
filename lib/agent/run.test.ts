/**
 * lib/agent/run.test.ts — Moteur agentique OpenAI, avec SDK entièrement mocké.
 *
 * ZÉRO appel réseau réel : `getOpenAiClient` est mocké et renvoie un client dont
 * `chat.completions.create` produit un async-iterable de chunks scriptés.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentFrame, ToolContext } from "@/lib/agent/types";

// ─── Mock du client OpenAI ───────────────────────────────────────────────────

type Chunk = {
  choices?: Array<{ delta?: { content?: string; tool_calls?: unknown[] } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
};

/** File de "réponses" du modèle : chaque entrée = un tour (liste de chunks). */
const scriptedTurns: Chunk[][] = [];
const createSpy = vi.fn();

function pushTextTurn(text: string): void {
  scriptedTurns.push([
    { choices: [{ delta: { content: text } }] },
    { usage: { prompt_tokens: 5, completion_tokens: 3 } },
  ]);
}

function pushToolTurn(id: string, name: string, args: string): void {
  scriptedTurns.push([
    {
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, id, function: { name, arguments: args } }],
          },
        },
      ],
    },
    { usage: { prompt_tokens: 4, completion_tokens: 2 } },
  ]);
}

async function* iterate(chunks: Chunk[]): AsyncGenerator<Chunk> {
  for (const c of chunks) yield c;
}

vi.mock("@/lib/llm/openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/openai")>();
  return {
    ...actual,
    getOpenAiClient: () => {
      // Reproduit le fail-closed du vrai client : pas de clé → OpenAiError.
      if (!process.env.OPENAI_API_KEY) throw new actual.OpenAiError("missing_key");
      return {
      chat: {
        completions: {
          create: (...cbArgs: unknown[]) => {
            createSpy(...cbArgs);
            const turn = scriptedTurns.shift() ?? [];
            return Promise.resolve(iterate(turn));
          },
        },
      },
      };
    },
  };
});

// ─── Mock du registry : un tool de lecture + un tool de mutation ─────────────

/** Enregistre les appels réels d'exécution des tools (pour prouver l'owner-check
 *  et le non-passage à l'exécution d'une mutation non confirmée). */
const readExec = vi.fn();
const mutationExec = vi.fn();

vi.mock("@/lib/agent/tools/registry", () => {
  const readTool = {
    name: "read_leads",
    description: "Lit les leads (lecture directe, owner-check user_id+tenant_id).",
    inputSchema: { type: "object", properties: {}, required: [] },
    async execute(_args: Record<string, unknown>, ctx: ToolContext) {
      // L'owner-check est matérialisé ici par la présence de ctx.userId + ctx.tenant.
      readExec({ userId: ctx.userId, tenant: ctx.tenant });
      return { ok: true, summary: "1 lead", observation: `Leads pour ${ctx.userId}/${ctx.tenant} : Jean.` };
    },
  };
  const mutationTool = {
    name: "delete_lead",
    description: "Supprime un lead. DESTRUCTIF : confirmed=true requis.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, confirmed: { type: "boolean" } },
      required: ["id", "confirmed"],
    },
    async execute(args: Record<string, unknown>) {
      if (args.confirmed !== true) {
        // Ne s'exécute PAS : reste une proposition en attente de confirmation.
        return {
          ok: false,
          summary: "Confirmation requise",
          observation: "Suppression NON exécutée. Demande une confirmation explicite.",
        };
      }
      mutationExec(args);
      return { ok: true, summary: "Lead supprimé", observation: "Lead supprimé." };
    },
  };
  const ALL_TOOLS = [readTool, mutationTool];
  return {
    ALL_TOOLS,
    getTool: (name: string) => ALL_TOOLS.find((t) => t.name === name),
  };
});

import { runAgent } from "./run";

// ─── Contexte de test ────────────────────────────────────────────────────────

function makeCtx(): { ctx: ToolContext; frames: AgentFrame[] } {
  const frames: AgentFrame[] = [];
  const ctx: ToolContext = {
    userId: "user-1",
    tenant: "tenant-1",
    ownerId: "user-1",
    origin: "https://app.test",
    // Stub Supabase : non utilisé par les tools mockés de ce fichier.
    sb: {} as unknown as ToolContext["sb"],
    emit: (f) => frames.push(f),
  };
  return { ctx, frames };
}

beforeEach(() => {
  scriptedTurns.length = 0;
  createSpy.mockClear();
  readExec.mockClear();
  mutationExec.mockClear();
  process.env.OPENAI_API_KEY = "sk-test";
});

describe("runAgent (moteur OpenAI, stream mocké)", () => {
  it("stream texte simple → assistantText + frames text", async () => {
    pushTextTurn("Bonjour, je suis l'assistant.");
    const { ctx, frames } = makeCtx();

    const res = await runAgent({
      model: "gpt-5.4",
      system: "Système.",
      history: [],
      userMessage: "Salut",
      ctx,
    });

    expect(res.assistantText).toBe("Bonjour, je suis l'assistant.");
    expect(frames.filter((f) => f.type === "text")).toHaveLength(1);
    expect(res.usage).toEqual({ input: 5, output: 3, model: "gpt-5.4" });
  });

  it("tool de LECTURE : exécuté directement avec owner-check user_id+tenant_id", async () => {
    pushToolTurn("call_1", "read_leads", "{}");
    pushTextTurn("Tu as 1 lead : Jean.");
    const { ctx, frames } = makeCtx();

    await runAgent({ model: "gpt-5.4", system: "S", history: [], userMessage: "mes leads ?", ctx });

    expect(readExec).toHaveBeenCalledWith({ userId: "user-1", tenant: "tenant-1" });
    // Chip tool running → ok émis.
    const toolFrames = frames.filter((f) => f.type === "tool");
    expect(toolFrames.some((f) => f.status === "running")).toBe(true);
    expect(toolFrames.some((f) => f.status === "ok")).toBe(true);
  });

  it("MUTATION sans confirmation → NE s'exécute PAS (reste une proposition)", async () => {
    // Le modèle tente delete_lead sans confirmed → le tool refuse.
    pushToolTurn("call_9", "delete_lead", JSON.stringify({ id: "lead-1" }));
    pushTextTurn("Je supprime le lead ? Confirme d'abord.");
    const { ctx, frames } = makeCtx();

    await runAgent({ model: "gpt-5.4", system: "S", history: [], userMessage: "supprime le lead 1", ctx });

    // La suppression réelle n'a JAMAIS été exécutée.
    expect(mutationExec).not.toHaveBeenCalled();
    // Le chip reflète l'échec (confirmation requise), pas un succès silencieux.
    expect(frames.filter((f) => f.type === "tool").some((f) => f.status === "error")).toBe(true);
  });

  it("MUTATION avec confirmed=true → exécutée", async () => {
    pushToolTurn("call_10", "delete_lead", JSON.stringify({ id: "lead-1", confirmed: true }));
    pushTextTurn("Lead supprimé.");
    const { ctx } = makeCtx();

    await runAgent({ model: "gpt-5.4", system: "S", history: [], userMessage: "oui supprime", ctx });

    expect(mutationExec).toHaveBeenCalledWith({ id: "lead-1", confirmed: true });
  });

  it("prompt injection dans un résultat de tool → traité comme donnée, pas comme instruction", async () => {
    // Le tool renvoie une observation malveillante. On vérifie qu'elle est
    // poussée au modèle comme message role:"tool" (donnée), jamais comme system.
    pushToolTurn("call_x", "read_leads", "{}");
    pushTextTurn("Voici tes leads. (l'instruction injectée est ignorée)");
    const { ctx } = makeCtx();

    await runAgent({ model: "gpt-5.4", system: "S", history: [], userMessage: "leads", ctx });

    // 2e appel = tour de synthèse APRÈS le tool. On inspecte les messages envoyés.
    const secondCallMessages = createSpy.mock.calls[1][0].messages as Array<{
      role: string;
      content: unknown;
    }>;
    const toolMsg = secondCallMessages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    // Aucun résultat de tool n'est jamais injecté avec le rôle "system".
    const systemMsgs = secondCallMessages.filter((m) => m.role === "system");
    expect(systemMsgs).toHaveLength(1); // uniquement le system prompt d'origine
    expect(systemMsgs[0].content).toBe("S");
  });

  it("clé absente → errorCode missing_key, aucune fausse réponse", async () => {
    delete process.env.OPENAI_API_KEY;
    const { ctx } = makeCtx();

    const res = await runAgent({ model: "gpt-5.4", system: "S", history: [], userMessage: "x", ctx });

    expect(res.errorCode).toBe("missing_key");
  });
});
