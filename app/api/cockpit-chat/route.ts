import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { kimi, KIMI_MODEL, kimiIsConfigured } from "@/lib/llm/kimi";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  chatId: z.string().uuid().optional(),
  message: z.string().min(1).max(8000),
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
    const { data } = await sb
      .from("cockpit_chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .eq("tenant_id", tenant)
      .maybeSingle();
    if (!data) chatId = undefined;
  }
  if (!chatId) {
    const { data, error } = await sb
      .from("cockpit_chats")
      .insert({ user_id: userId, tenant_id: tenant, title: message.slice(0, 60) })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "chat_create_failed" }, { status: 500 });
    chatId = data.id;
  }

  await sb.from("cockpit_messages").insert({ chat_id: chatId, tenant_id: tenant, role: "user", content: message });

  // Historique + mémoire tenant pour le system prompt
  const { data: history } = await sb
    .from("cockpit_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: true })
    .limit(40);

  const { data: memories } = await sb
    .from("tenant_memory")
    .select("content")
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: false })
    .limit(20);

  const memoryBlock = (memories ?? []).map((m) => `- ${m.content}`).join("\n");
  const system =
    "Tu es l'assistant Cockpit de Real estate Agent. Réponds en français, de façon concise et actionnable." +
    (memoryBlock ? `\n\nMémoire du tenant :\n${memoryBlock}` : "");

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

  const completion = await kimi.chat.completions.create({
    model: KIMI_MODEL,
    stream: true,
    messages,
  });

  const encoder = new TextEncoder();
  let assistantFull = "";
  // Machine à états pour retirer les blocs <think>…</think> du flux content.
  let inThink = false;
  let buffer = "";
  const OPEN = "<think>";
  const CLOSE = "</think>";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (!delta) continue;
          buffer += delta;

          // Tant qu'on peut trancher une balise complète, on traite.
          // On garde une marge (longueur de la plus longue balise - 1) pour les balises coupées.
          while (true) {
            if (!inThink) {
              const idx = buffer.indexOf(OPEN);
              if (idx === -1) {
                const safe = buffer.length - (CLOSE.length - 1);
                if (safe > 0) {
                  const emit = buffer.slice(0, safe);
                  buffer = buffer.slice(safe);
                  if (emit) {
                    assistantFull += emit;
                    controller.enqueue(encoder.encode(emit));
                  }
                }
                break;
              } else {
                const emit = buffer.slice(0, idx);
                if (emit) {
                  assistantFull += emit;
                  controller.enqueue(encoder.encode(emit));
                }
                buffer = buffer.slice(idx + OPEN.length);
                inThink = true;
              }
            } else {
              const idx = buffer.indexOf(CLOSE);
              if (idx === -1) {
                // Rester en think, conserver une marge pour une balise coupée
                const keep = CLOSE.length - 1;
                if (buffer.length > keep) buffer = buffer.slice(buffer.length - keep);
                break;
              } else {
                buffer = buffer.slice(idx + CLOSE.length);
                inThink = false;
              }
            }
          }
        }
        // Flush le reste hors think
        if (!inThink && buffer) {
          assistantFull += buffer;
          controller.enqueue(encoder.encode(buffer));
        }
      } catch {
        controller.enqueue(encoder.encode("\n[Erreur de génération]"));
      } finally {
        if (assistantFull.trim()) {
          await sb
            .from("cockpit_messages")
            .insert({ chat_id: chatId!, tenant_id: tenant, role: "assistant", content: assistantFull });
        }
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
