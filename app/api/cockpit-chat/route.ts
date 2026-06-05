import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { kimi } from "@/lib/llm/kimi";
import { INTERVIEW_MODEL } from "@/lib/ai/interview";
import { tenantOf } from "@/lib/tenant";
import { trace } from "@/lib/providers/langfuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_MAX = 8000;
const CHAT_TITLE_MAX = 60;
const HISTORY_LIMIT = 40;
const MEMORY_LIMIT = 20;
const KIMI_MAX_TOKENS = 8192;
const ANTHROPIC_MAX_TOKENS = 2048;

// ── Aligné sur « la simulation » (entretien d'estimation, lib/ai/interview) ──
// Même modèle par défaut (claude-opus-4-8) et même choix de provider :
// Anthropic si le modèle est un Claude ET ANTHROPIC_API_KEY présent, sinon
// chemin Kimi/OpenAI-compatible (Moonshot/Hypercli). Override : COCKPIT_CHAT_MODEL.
const CHAT_MODEL = process.env.COCKPIT_CHAT_MODEL || INTERVIEW_MODEL;
function usesKimiPath(model: string): boolean {
  return (
    model.startsWith("kimi") ||
    model.startsWith("moonshot") ||
    !process.env.ANTHROPIC_API_KEY
  );
}
function chatIsConfigured(model: string): boolean {
  return usesKimiPath(model)
    ? Boolean(process.env.MOONSHOT_API_KEY || process.env.HYPERCLI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY);
}

const BodySchema = z.object({
  chatId: z.string().uuid().optional(),
  message: z.string().min(1).max(MESSAGE_MAX),
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
  const { data: history } = await sb
    .from("cockpit_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  const { data: memories } = await sb
    .from("tenant_memory")
    .select("content")
    .eq("tenant_id", tenant)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MEMORY_LIMIT);

  const memoryBlock = (memories ?? []).map((m) => `- ${m.content}`).join("\n");
  const system =
    "Tu es l'assistant Cockpit de Real estate Agent. Réponds en français, de façon concise et actionnable." +
    (memoryBlock ? `\n\nMémoire de l'utilisateur :\n${memoryBlock}` : "");

  // Conversation user/assistant (le system est placé selon le provider).
  const convo = (history ?? [])
    .filter((m) => m.content !== null && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: m.content as string,
    }));

  // Observabilité Langfuse — métadonnées seulement, no-op si non configuré.
  let t: { end: (output: unknown) => void } = { end: () => {} };
  try {
    t = trace(
      "cockpit-chat",
      { model, messageCount: convo.length },
      { provider: useKimi ? "kimi" : "anthropic", model },
    );
  } catch {
    // trace() ne doit jamais bloquer le chat.
  }

  const encoder = new TextEncoder();
  let assistantFull = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (txt: string) => {
        assistantFull += txt;
        controller.enqueue(encoder.encode(txt));
      };
      try {
        if (useKimi) {
          // Chemin Kimi / OpenAI-compatible (le raisonnement reasoning_content est ignoré).
          const completion = await kimi.chat.completions.create({
            model,
            stream: true,
            max_tokens: KIMI_MAX_TOKENS,
            messages: [{ role: "system" as const, content: system }, ...convo],
          });
          for await (const chunk of completion) {
            const delta = chunk.choices?.[0]?.delta?.content ?? "";
            if (delta) push(delta);
          }
        } else {
          // Chemin Anthropic (Claude Opus 4.8 par défaut), comme l'entretien.
          const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const astream = anthropic.messages.stream({
            model,
            max_tokens: ANTHROPIC_MAX_TOKENS,
            system,
            messages: convo.map((m) => ({ role: m.role, content: m.content })),
          });
          astream.on("text", (delta) => push(delta));
          await astream.finalMessage();
        }
      } catch {
        controller.enqueue(encoder.encode("\n[Erreur de génération]"));
      } finally {
        if (assistantFull.trim()) {
          await sb
            .from("cockpit_messages")
            .insert({ chat_id: chatId!, tenant_id: tenant, role: "assistant", content: assistantFull });
        }
        t.end({ outputLen: assistantFull.length });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Chat-Id": chatId,
    },
  });
}
