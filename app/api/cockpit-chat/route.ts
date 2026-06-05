import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { kimi, KIMI_MODEL, kimiIsConfigured } from "@/lib/llm/kimi";
import { tenantOf } from "@/lib/tenant";
import { trace } from "@/lib/providers/langfuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_MAX = 8000;
const CHAT_TITLE_MAX = 60;
const HISTORY_LIMIT = 40;
const MEMORY_LIMIT = 20;
const KIMI_MAX_TOKENS = 8192;

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
  if (!kimiIsConfigured()) return NextResponse.json({ error: "kimi_not_configured" }, { status: 503 });

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
    // Erreur DB transitoire → 500 (ne pas abandonner silencieusement le chat fourni).
    if (error) return NextResponse.json({ error: "chat_lookup_failed" }, { status: 500 });
    if (!data) chatId = undefined; // chat non possédé → on repart sur un chat neuf
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

  const messages = [
    { role: "system" as const, content: system },
    ...(history ?? []).map((m) => ({
      role: (m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user") as
        | "assistant"
        | "system"
        | "user",
      content: m.content,
    })),
  ];

  // Observabilité Langfuse — métadonnées seulement (pas de contenu PII), no-op si non configuré.
  let t: { end: (output: unknown) => void } = { end: () => {} };
  try {
    t = trace(
      "cockpit-chat",
      { model: KIMI_MODEL, messageCount: messages.length },
      { provider: "kimi", model: KIMI_MODEL },
    );
  } catch {
    // trace() ne doit jamais bloquer le chat.
  }

  const completion = await kimi.chat.completions.create({
    model: KIMI_MODEL,
    stream: true,
    // kimi-k2.6 est un modèle à raisonnement : il faut un budget large pour que la
    // réponse (`content`) arrive après le raisonnement (`reasoning_content`).
    max_tokens: KIMI_MAX_TOKENS,
    messages,
  });

  const encoder = new TextEncoder();
  let assistantFull = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          // Le raisonnement arrive dans delta.reasoning_content (champ séparé) → ignoré.
          // On ne stream que la réponse finale (delta.content).
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (!delta) continue;
          assistantFull += delta;
          controller.enqueue(encoder.encode(delta));
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
