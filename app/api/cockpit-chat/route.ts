/**
 * app/api/cockpit-chat/route.ts — Chat Cockpit AGENTIQUE.
 *
 * Orchestrateur mince : auth → scope/chat → mémoire → historique → contexte
 * (faits de la page courante) → runAgent (boucle function-calling OpenAI) →
 * streaming NDJSON (frames chat|text|tool|action|error|done) → persistance.
 *
 * Toutes les ACTIONS passent par des outils (`lib/agent/tools/*`) filtrés
 * user_id+tenant_id — plus aucun parsing regex côté route.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { OPENAI_CHAT_MODEL, openaiIsConfigured } from "@/lib/llm/openai";
import { tenantOf, uuidOwnerOf } from "@/lib/tenant";
import { trace, type TraceUsage } from "@/lib/providers/langfuse";
import { captureServer } from "@/lib/providers/posthog";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import type { PropertyData } from "@/lib/estimation/types";
import { runAgent } from "@/lib/agent/run";
import { buildAgentSystemPrompt } from "@/lib/agent/prompt";
import type { AgentFrame, ToolContext } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La boucle agentique peut enchaîner plusieurs tours d'outils + LLM.
export const maxDuration = 120;

const MESSAGE_MAX = 8000;
const CHAT_TITLE_MAX = 60;
const HISTORY_LIMIT = 40;
const MEMORY_LIMIT = 20;

const BodySchema = z.object({
  chatId: z.string().uuid().optional(),
  message: z.string().min(1).max(MESSAGE_MAX),
  context: z.object({ pathname: z.string().max(500).optional() }).optional(),
});

const MEMORIZE_RE = /^\s*(?:m[ée]morise|retiens|souviens[- ]toi)\s*:?\s*(.+)/i;

function estimationIdFromPathname(pathname: string | undefined): string | null {
  return pathname?.match(/^\/estimations\/([^/]+)$/)?.[1] ?? null;
}

function knownValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  return String(value);
}

/** Faits DB de l'estimation courante, injectés comme contexte prioritaire. */
function buildEstimationContextBlock(estimation: Awaited<ReturnType<typeof loadOwnedEstimation>>): string {
  if (!estimation) return "";
  const property = (estimation.property ?? {}) as Partial<PropertyData>;
  const facts: Array<[string, unknown]> = [
    ["id", estimation.id],
    ["statut", estimation.status],
    ["type_bien", property.type_bien ?? estimation.property_type],
    ["ville", property.ville ?? estimation.city],
    ["code_postal", property.code_postal ?? estimation.postal_code],
    ["adresse", property.adresse],
    ["surface_habitable_m2", property.surface_habitable_m2 ?? estimation.surface],
    ["nombre_pieces", property.nombre_pieces],
    ["nombre_chambres", property.nombre_chambres],
    ["etage", property.etage],
    ["dpe_classe", property.dpe_classe],
    ["etat_general", property.etat_general],
    ["occupation", property.occupation],
    ["market_value", estimation.market_value],
    ["recommended_price", estimation.recommended_price],
  ];
  const lines = facts.flatMap(([label, value]) => {
    const known = knownValue(value);
    return known ? [`- ${label}: ${known}`] : [];
  });
  const missing = facts.flatMap(([label, value]) => (knownValue(value) ? [] : [label]));
  return [
    "Estimation en cours d'entretien (utilise `set_estimation_field` avec cet `id` pour renseigner un champ) :",
    ...(lines.length ? lines : ["- aucune donnée métier renseignée"]),
    missing.length ? `Champs manquants à compléter : ${missing.join(", ")}` : "",
    "Règle : n'invente jamais une ville, une adresse, un prix ou une caractéristique absente de ce contexte.",
  ].filter(Boolean).join("\n");
}

export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  // Mode dégradé HONNÊTE : sans clé OpenAI, l'assistant est désactivé — 503 clair,
  // jamais de fausse réponse. Le reste de l'app continue de fonctionner.
  if (!openaiIsConfigured()) {
    return NextResponse.json(
      { error: "assistant_not_configured", message: "L'assistant IA n'est pas configuré." },
      { status: 503 },
    );
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const userId = claims.sub;
  const tenant = tenantOf(claims);
  const ownerId = uuidOwnerOf(claims);
  captureServer(userId, "chat_message", { model: OPENAI_CHAT_MODEL });
  const { message, context } = parsed.data;
  const estimationId = estimationIdFromPathname(context?.pathname);
  const chatScope = estimationId ? `estimation:${estimationId}` : `page:${context?.pathname ?? "global"}`;

  // Capture mémoire « mémorise: … ».
  const mem = message.match(MEMORIZE_RE);
  if (mem?.[1]) {
    await sb.from("tenant_memory").insert({ tenant_id: tenant, user_id: userId, content: mem[1].trim() });
  }

  // Chat (créer si absent), scopé user + tenant + contexte de page.
  let chatId = parsed.data.chatId;
  if (chatId) {
    const { data, error } = await sb
      .from("cockpit_chats")
      .select("id,title")
      .eq("id", chatId)
      .eq("user_id", userId)
      .eq("tenant_id", tenant)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "chat_lookup_failed" }, { status: 500 });
    if (!data || !data.title?.startsWith(chatScope)) chatId = undefined;
  }
  if (!chatId) {
    const { data, error } = await sb
      .from("cockpit_chats")
      .insert({ user_id: userId, tenant_id: tenant, title: `${chatScope} — ${message}`.slice(0, CHAT_TITLE_MAX) })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "chat_create_failed" }, { status: 500 });
    chatId = data.id;
  }

  // Historique ANTÉRIEUR (avant d'insérer le message courant).
  const { data: priorHistory } = await sb
    .from("cockpit_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  await sb.from("cockpit_messages").insert({ chat_id: chatId, tenant_id: tenant, role: "user", content: message });

  // Mémoire utilisateur + contexte de page.
  const { data: memories } = await sb
    .from("tenant_memory")
    .select("content")
    .eq("tenant_id", tenant)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MEMORY_LIMIT);
  const memoryBlock = (memories ?? []).map((m) => `- ${m.content}`).join("\n");

  const currentEstimation = estimationId ? await loadOwnedEstimation(sb, estimationId, userId, tenant).catch(() => null) : null;
  const contextBlock = buildEstimationContextBlock(currentEstimation);

  const system = buildAgentSystemPrompt(memoryBlock, contextBlock);
  const history = (priorHistory ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // Observabilité (no-op si non configurée).
  let t: { end: (output: unknown, usage?: TraceUsage) => void } = { end: () => {} };
  try {
    t = trace("cockpit-chat", { model: OPENAI_CHAT_MODEL, historyLen: history.length }, { provider: "openai", model: OPENAI_CHAT_MODEL });
  } catch {
    /* trace ne doit jamais bloquer le chat */
  }

  const encoder = new TextEncoder();
  const finalChatId = chatId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (frame: AgentFrame) => controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
      write({ type: "chat", chatId: finalChatId });

      const ctx: ToolContext = { userId, tenant, ownerId, origin: new URL(req.url).origin, sb, emit: write };
      let assistantText = "";
      let usage: TraceUsage | undefined;
      try {
        const res = await runAgent({
          model: OPENAI_CHAT_MODEL,
          system,
          history,
          userMessage: message,
          ctx,
          signal: req.signal,
        });
        assistantText = res.assistantText;
        usage = res.usage;
        // runAgent ne throw pas : il émet déjà une frame `error` avec le message
        // FR adapté (quota, rate_limit, model_unavailable…) via openAiErrorMessage.
      } catch (err) {
        console.error("[cockpit-chat] runAgent error:", err instanceof Error ? err.message : String(err));
        write({ type: "error", message: "L'assistant est momentanément indisponible. Réessaie dans un instant." });
      } finally {
        if (assistantText.trim()) {
          await sb.from("cockpit_messages").insert({ chat_id: finalChatId, tenant_id: tenant, role: "assistant", content: assistantText });
        }
        t.end({ outputLen: assistantText.length }, usage);
        write({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Chat-Id": finalChatId,
    },
  });
}
