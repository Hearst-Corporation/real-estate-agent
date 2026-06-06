import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { INTERVIEW_MODEL, usesKimiPath } from "@/lib/ai/interview";
import { tenantOf } from "@/lib/tenant";
import { rateLimit } from "@/lib/ratelimit";
import { trace, type TraceUsage } from "@/lib/providers/langfuse";
import { runAgent } from "@/lib/agent/run";
import { buildAgentSystemPrompt } from "@/lib/agent/prompt";
import type { AgentFrame } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_MAX = 8000;
const MESSAGE_MIN = 1;
const CHAT_TITLE_MAX = 60;
const HISTORY_LIMIT = 40;
const MEMORY_LIMIT = 20;

// Rate-limit léger : N requêtes agent par fenêtre, par utilisateur.
const RL_LIMIT = 120;
const RL_WINDOW_SEC = 60;

// ── Aligné sur « la simulation » (entretien d'estimation, lib/ai/interview) ──
// Même modèle par défaut (claude-opus-4-8) et même choix de provider :
// Anthropic si le modèle est un Claude ET ANTHROPIC_API_KEY présent, sinon
// chemin Kimi/OpenAI-compatible (Moonshot/Hypercli). Override : COCKPIT_CHAT_MODEL.
const CHAT_MODEL = process.env.COCKPIT_CHAT_MODEL || INTERVIEW_MODEL;

function chatIsConfigured(model: string): boolean {
  return usesKimiPath(model)
    ? Boolean(process.env.MOONSHOT_API_KEY || process.env.HYPERCLI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY);
}

const BodySchema = z.object({
  chatId: z.string().uuid().optional(),
  message: z.string().min(MESSAGE_MIN).max(MESSAGE_MAX),
});

const MEMORIZE_RE = /^\s*(?:m[ée]morise|retiens|souviens[- ]toi)\s*:?\s*(.+)/i;

export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const model = CHAT_MODEL;
  const useKimi = usesKimiPath(model);
  if (!chatIsConfigured(model)) {
    return NextResponse.json({ error: "llm_not_configured" }, { status: 503 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const userId = claims.sub;
  const tenant = tenantOf(claims);
  const { message } = parsed.data;

  // Rate-limit léger (avant de streamer).
  const allowed = await rateLimit(`cockpit-agent:${userId}`, RL_LIMIT, RL_WINDOW_SEC);
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  // Capture mémoire « mémorise: … »
  const mem = message.match(MEMORIZE_RE);
  if (mem?.[1]) {
    await sb.from("tenant_memory").insert({ tenant_id: tenant, user_id: userId, content: mem[1].trim() });
  }

  // Chat (créer si absent), scopé user + tenant
  let chatId = parsed.data.chatId;
  if (chatId) {
    const { data, error } = await sb
      .from("cockpit_chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .eq("tenant_id", tenant)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "chat_lookup_failed" }, { status: 500 });
    if (!data) chatId = undefined; // chat non possédé → chat neuf
  }
  if (!chatId) {
    const { data, error } = await sb
      .from("cockpit_chats")
      .insert({ user_id: userId, tenant_id: tenant, title: message.slice(0, CHAT_TITLE_MAX) })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "chat_create_failed" }, { status: 500 });
    chatId = data.id;
  }

  await sb.from("cockpit_messages").insert({ chat_id: chatId, tenant_id: tenant, role: "user", content: message });

  // Historique + mémoire utilisateur pour le system prompt
  // Récupère les 40 DERNIERS messages (ordre DESC) puis les remet en ordre chrono.
  const { data: historyDesc } = await sb
    .from("cockpit_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = (historyDesc ?? []).reverse();

  const { data: memories } = await sb
    .from("tenant_memory")
    .select("content")
    .eq("tenant_id", tenant)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MEMORY_LIMIT);

  const memoryBlock = (memories ?? []).map((m) => `- ${m.content}`).join("\n");
  const system = buildAgentSystemPrompt(memoryBlock);

  // Conversation user/assistant (le dernier message vient d'être inséré → on
  // l'exclut de l'historique passé à l'agent et on le fournit comme userMessage).
  const allConvo = history
    .filter((m) => m.content !== null && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: m.content as string,
    }));
  // Retire le dernier message s'il s'agit du message utilisateur courant.
  const convo =
    allConvo.length > 0 &&
    allConvo[allConvo.length - 1].role === "user" &&
    allConvo[allConvo.length - 1].content === message
      ? allConvo.slice(0, -1)
      : allConvo;

  // Observabilité Langfuse — métadonnées seulement, no-op si non configuré.
  let t: ReturnType<typeof trace> = { end: () => {} };
  try {
    t = trace(
      "cockpit-agent",
      { model, messageCount: convo.length },
      { provider: useKimi ? "kimi" : "anthropic", model },
    );
  } catch {
    // trace() ne doit jamais bloquer le chat.
  }

  const encoder = new TextEncoder();
  const chatIdFinal = chatId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeFrame = (frame: AgentFrame) => {
        controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
      };

      let assistantText = "";
      let llmUsage: TraceUsage | undefined;
      try {
        // Frame initiale : id du chat (créé/retrouvé).
        writeFrame({ type: "chat", chatId: chatIdFinal });

        const result = await runAgent({
          model,
          system,
          history: convo,
          userMessage: message,
          ctx: { userId, tenant, sb, emit: writeFrame },
        });
        assistantText = result.assistantText;
        llmUsage = result.usage;
      } catch {
        writeFrame({ type: "error", message: "Erreur de génération." });
      } finally {
        if (assistantText.trim()) {
          await sb
            .from("cockpit_messages")
            .insert({ chat_id: chatIdFinal, tenant_id: tenant, role: "assistant", content: assistantText });
        }
        writeFrame({ type: "done" });
        t.end({ outputLen: assistantText.length }, llmUsage);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Chat-Id": chatIdFinal,
    },
  });
}
