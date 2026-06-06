import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { kimi, KIMI_MODEL, kimiIsConfigured } from "@/lib/llm/kimi";
import { tenantOf } from "@/lib/tenant";
import { trace } from "@/lib/providers/langfuse";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import { signShareToken } from "@/lib/estimation/share";
import { sendEmail } from "@/lib/providers/resend-email";
import type { FieldStatusMap, PropertyData } from "@/lib/estimation/types";
import type { Json } from "@/lib/supabase/database.types";

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
  context: z.object({
    pathname: z.string().max(500).optional(),
  }).optional(),
});

const MEMORIZE_RE = /^\s*(?:m[ée]morise|retiens|souviens[- ]toi)\s*:?\s*(.+)/i;
const TYPE_BIEN_ALIASES: Array<{
  value: NonNullable<PropertyData["type_bien"]>;
  pattern: RegExp;
}> = [
  { value: "appartement", pattern: /\b(appartement|appart|studio|t[1-6])\b/i },
  { value: "maison", pattern: /\b(maison|villa|pavillon)\b/i },
  { value: "immeuble", pattern: /\bimmeuble\b/i },
  { value: "local_commercial", pattern: /\b(local commercial|commerce|boutique)\b/i },
  { value: "terrain", pattern: /\bterrain\b/i },
  { value: "autre", pattern: /\bautre\b/i },
];

type EstimationAction = {
  field: keyof PropertyData;
  value: string | number | boolean;
  valueType: "string" | "number" | "boolean";
};

type OperatorAction =
  | { kind: "create_lead"; fullName: string; email: string | null; phone: string | null }
  | { kind: "delete_lead"; identifier: string; confirmed: boolean }
  | { kind: "create_property_from_estimation"; estimationId: string }
  | { kind: "send_estimation_to_email"; estimationId: string; email: string; confirmed: boolean };

const FIELD_LABELS: Partial<Record<keyof PropertyData, string>> = {
  type_bien: "type de bien",
  surface_habitable_m2: "surface habitable",
  nombre_pieces: "nombre de pièces",
  nombre_chambres: "nombre de chambres",
  etage: "étage",
  ascenseur: "ascenseur",
  cave: "cave",
  travaux_votes: "travaux votés",
  dpe_classe: "DPE",
  etat_general: "état général",
  occupation: "occupation",
};

function knownValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  return String(value);
}

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
    "Contexte factuel de l'estimation courante (source base de données, prioritaire sur l'historique du chat):",
    ...(lines.length ? lines : ["- aucune donnée métier renseignée"]),
    missing.length ? `Champs manquants: ${missing.join(", ")}` : "",
    "Règle: n'invente jamais une ville, une adresse, un prix ou une caractéristique absente de ce contexte. Si une donnée manque, dis qu'elle est à compléter.",
  ].filter(Boolean).join("\n");
}

function estimationIdFromPathname(pathname: string | undefined): string | null {
  const match = pathname?.match(/^\/estimations\/([^/]+)$/);
  return match?.[1] ?? null;
}

function detectTypeBien(message: string): NonNullable<PropertyData["type_bien"]> | null {
  const normalized = message.trim();
  const looksLikeQuestion =
    normalized.includes("?") ||
    /\b(combien|pourquoi|comment|quand|quelle|quel|peux-tu|explique)\b/i.test(normalized);
  if (looksLikeQuestion) return null;
  if (normalized.length > 120) return null;
  return TYPE_BIEN_ALIASES.find((alias) => alias.pattern.test(normalized))?.value ?? null;
}

function boolAction(message: string, field: "ascenseur" | "cave" | "travaux_votes"): EstimationAction | null {
  const hasField = new RegExp(`\\b${field === "travaux_votes" ? "travaux" : field}\\b`, "i").test(message);
  if (!hasField) return null;
  const negative = /\b(non|pas|aucun|sans)\b/i.test(message);
  const positive = /\b(oui|avec|présent|presente|présente|il y a)\b/i.test(message);
  if (!negative && !positive) return null;
  return { field, value: positive && !negative, valueType: "boolean" };
}

function detectEstimationAction(message: string): EstimationAction | null {
  const normalized = message.trim();
  const looksLikeQuestion =
    normalized.includes("?") ||
    /\b(combien|pourquoi|comment|quand|quelle|quel|peux-tu|explique)\b/i.test(normalized);
  if (looksLikeQuestion || normalized.length > 160) return null;

  const typeBien = detectTypeBien(normalized);
  if (typeBien) return { field: "type_bien", value: typeBien, valueType: "string" };

  const dpe = normalized.match(/\b(?:dpe|classe)\s*([A-G])\b/i);
  if (dpe?.[1]) return { field: "dpe_classe", value: dpe[1].toUpperCase(), valueType: "string" };

  const surface = normalized.match(/\b(\d{1,5}(?:[,.]\d{1,2})?)\s*(?:m2|m²|mètres carrés|metres carres)\b/i);
  if (surface?.[1]) {
    const value = Number(surface[1].replace(",", "."));
    if (value > 0 && value <= 100000) {
      return { field: "surface_habitable_m2", value, valueType: "number" };
    }
  }

  const pieces = normalized.match(/\b(\d{1,2})\s*pi[eè]ces?\b/i);
  if (pieces?.[1]) return { field: "nombre_pieces", value: Number(pieces[1]), valueType: "number" };

  const chambres = normalized.match(/\b(\d{1,2})\s*chambres?\b/i);
  if (chambres?.[1]) return { field: "nombre_chambres", value: Number(chambres[1]), valueType: "number" };

  const etage = normalized.match(/\b(?:étage|etage|au)\s*(-?\d{1,3})(?:e|er|ème|eme)?\b/i);
  if (etage?.[1]) return { field: "etage", value: Number(etage[1]), valueType: "number" };

  const bool =
    boolAction(normalized, "ascenseur") ??
    boolAction(normalized, "cave") ??
    boolAction(normalized, "travaux_votes");
  if (bool) return bool;

  if (/\b(a renover|à rénover|renover|rénover)\b/i.test(normalized)) {
    return { field: "etat_general", value: "a_renover", valueType: "string" };
  }
  if (/\brafraichissement|rafraîchissement\b/i.test(normalized)) {
    return { field: "etat_general", value: "rafraichissement", valueType: "string" };
  }
  if (/\bbon état|bon etat\b/i.test(normalized)) {
    return { field: "etat_general", value: "bon", valueType: "string" };
  }
  if (/\brénové|renove|rénovée|renovée|renovation récente|rénovation récente\b/i.test(normalized)) {
    return { field: "etat_general", value: "renove_recemment", valueType: "string" };
  }
  if (/\bneuf|vefa\b/i.test(normalized)) {
    return { field: "etat_general", value: "neuf", valueType: "string" };
  }

  if (/\blibre\b/i.test(normalized)) return { field: "occupation", value: "libre", valueType: "string" };
  if (/\blou[ée]\b/i.test(normalized)) return { field: "occupation", value: "loue", valueType: "string" };
  if (/\brésidence principale|residence principale\b/i.test(normalized)) {
    return { field: "occupation", value: "residence_principale", valueType: "string" };
  }

  return null;
}

function firstEmail(message: string): string | null {
  return message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
}

function firstPhone(message: string): string | null {
  return message.match(/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/)?.[0] ?? null;
}

function cleanLeadName(raw: string): string {
  return raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/g, "")
    .replace(/\b(client|lead|contact|acheteur|vendeur|crée|cree|ajoute|nouveau|nouvelle)\b/gi, "")
    .replace(/[,:;-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function detectOperatorAction(message: string, estimationId: string | null): OperatorAction | null {
  const normalized = message.trim();
  const email = firstEmail(normalized);

  if (estimationId && /\b(fiche produit|produit|crée la fiche|cree la fiche|créer la fiche|creer la fiche)\b/i.test(normalized)) {
    return { kind: "create_property_from_estimation", estimationId };
  }

  if (estimationId && email && /\b(envoie|envoyer|send|partage|partager)\b/i.test(normalized) && /\b(fiche|avis de valeur|brochure|estimation)\b/i.test(normalized)) {
    return {
      kind: "send_estimation_to_email",
      estimationId,
      email,
      confirmed: /\b(confirme|confirmé|confirmez|ok pour envoyer)\b/i.test(normalized),
    };
  }

  if (/\b(supprime|supprimer|delete)\b/i.test(normalized) && /\b(client|lead|contact)\b/i.test(normalized)) {
    const identifier = email ?? normalized.replace(/\b(confirme|supprime|supprimer|delete|client|lead|contact)\b/gi, "").trim();
    if (identifier) {
      return {
        kind: "delete_lead",
        identifier,
        confirmed: /\b(confirme|confirmé|confirmez)\b/i.test(normalized),
      };
    }
  }

  if (/\b(crée|cree|ajoute|nouveau|nouvelle)\b/i.test(normalized) && /\b(client|lead|contact)\b/i.test(normalized)) {
    const fullName = cleanLeadName(normalized);
    if (fullName) {
      return { kind: "create_lead", fullName, email, phone: firstPhone(normalized) };
    }
  }

  return null;
}

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
  const { message, context } = parsed.data;
  const estimationId = estimationIdFromPathname(context?.pathname);
  const action = estimationId ? detectEstimationAction(message) : null;
  const operatorAction = detectOperatorAction(message, estimationId);
  let actionHeaders: Record<string, string> = {};
  const currentEstimation = estimationId
    ? await loadOwnedEstimation(sb, estimationId, userId, tenant)
    : null;
  const estimationContextBlock = buildEstimationContextBlock(currentEstimation);
  const chatScope = estimationId ? `estimation:${estimationId}` : `page:${context?.pathname ?? "global"}`;

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
      .select("id,title")
      .eq("id", chatId)
      .eq("user_id", userId)
      .eq("tenant_id", tenant)
      .maybeSingle();
    // Erreur DB transitoire → 500 (ne pas abandonner silencieusement le chat fourni).
    if (error) return NextResponse.json({ error: "chat_lookup_failed" }, { status: 500 });
    if (!data || !data.title?.startsWith(chatScope)) {
      chatId = undefined; // chat non possédé ou contexte différent → nouveau chat
    }
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
  let actionBlock = "";
  if (operatorAction) {
    try {
      if (operatorAction.kind === "create_lead") {
        const { data, error } = await sb
          .from("leads")
          .insert({
            user_id: userId,
            tenant_id: tenant,
            full_name: operatorAction.fullName,
            kind: "acheteur",
            email: operatorAction.email,
            phone: operatorAction.phone,
            source: "cockpit_chat",
            status: "nouveau",
          })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("lead_create_failed");
        actionBlock = `\n\nAction exécutée: lead créé (${operatorAction.fullName}). Réponds brièvement et indique que le CRM a été rempli.`;
        actionHeaders = { "X-Cockpit-Action": "crm:create_lead", "X-Cockpit-Value": data.id };
      }

      if (operatorAction.kind === "delete_lead") {
        if (!operatorAction.confirmed) {
          actionBlock = `\n\nAction non exécutée: suppression demandée pour "${operatorAction.identifier}". Demande une confirmation explicite avec "confirme supprimer client ${operatorAction.identifier}".`;
        } else {
          const lookup = sb
            .from("leads")
            .select("id,full_name,email")
            .eq("user_id", userId)
            .eq("tenant_id", tenant);
          const { data: candidates, error: lookupError } = operatorAction.identifier.includes("@")
            ? await lookup.eq("email", operatorAction.identifier)
            : await lookup.ilike("full_name", `%${operatorAction.identifier}%`).limit(2);
          if (lookupError) throw lookupError;
          if (!candidates || candidates.length !== 1) {
            actionBlock = candidates?.length
              ? "\n\nAction non exécutée: plusieurs clients correspondent. Demande l'email exact du client à supprimer."
              : "\n\nAction non exécutée: aucun client correspondant trouvé. Demande de vérifier le nom ou l'email.";
          } else {
            const { error } = await sb
              .from("leads")
              .delete()
              .eq("id", candidates[0].id)
              .eq("user_id", userId)
              .eq("tenant_id", tenant);
          if (error) throw error;
            actionBlock = `\n\nAction exécutée: client "${candidates[0].full_name}" supprimé. Réponds sobrement.`;
            actionHeaders = { "X-Cockpit-Action": "crm:delete_lead", "X-Cockpit-Value": candidates[0].id };
          }
        }
      }

      if (operatorAction.kind === "create_property_from_estimation") {
        const estimation = currentEstimation?.id === operatorAction.estimationId
          ? currentEstimation
          : await loadOwnedEstimation(sb, operatorAction.estimationId, userId, tenant);
        if (!estimation) throw new Error("estimation_not_found");
        const property = (estimation.property ?? {}) as Partial<PropertyData>;
        const address = property.adresse;
        const city = property.ville ?? estimation.city;
        const postalCode = property.code_postal ?? estimation.postal_code;
        if (!address || !city || !postalCode) {
          actionBlock = "\n\nAction non exécutée: impossible de créer la fiche produit car l'adresse, la ville ou le code postal manque dans l'estimation. Demande ces informations avant de réessayer.";
        } else {
          const title = [
            property.type_bien ?? "Bien",
            city,
            property.surface_habitable_m2 ? `${property.surface_habitable_m2} m²` : "",
          ].filter(Boolean).join(" - ");
          const { data, error } = await sb
            .from("properties")
            .insert({
              user_id: userId,
              tenant_id: tenant,
              status: "prospect",
              title,
              property_type: property.type_bien ?? estimation.property_type ?? "autre",
              address,
              city,
              postal_code: postalCode,
              surface: property.surface_habitable_m2 ?? estimation.surface ?? null,
              rooms: property.nombre_pieces ?? null,
              bedrooms: property.nombre_chambres ?? null,
              estimated_value: estimation.market_value,
              estimation_id: operatorAction.estimationId,
              notes: "Fiche créée depuis le chat Cockpit.",
            })
            .select("id")
            .single();
          if (error || !data) throw error ?? new Error("property_create_failed");
          actionBlock = `\n\nAction exécutée: fiche produit créée depuis l'estimation courante. Réponds avec l'ID ${data.id} et propose de compléter les champs manquants.`;
          actionHeaders = { "X-Cockpit-Action": "crm:create_property", "X-Cockpit-Value": data.id };
        }
      }

      if (operatorAction.kind === "send_estimation_to_email") {
        if (!operatorAction.confirmed) {
          actionBlock = `\n\nAction non exécutée: envoi demandé à ${operatorAction.email}. Demande une confirmation explicite avec "confirme envoyer fiche à ${operatorAction.email}".`;
        } else {
          const estimation = currentEstimation?.id === operatorAction.estimationId
            ? currentEstimation
            : await loadOwnedEstimation(sb, operatorAction.estimationId, userId, tenant);
          if (!estimation) throw new Error("estimation_not_found");
          if (estimation.status !== "ready") {
            actionBlock = "\n\nAction non exécutée: l'estimation n'est pas encore prête. Indique qu'il faut générer l'avis de valeur avant l'envoi.";
          } else {
            const token = await signShareToken(operatorAction.estimationId);
            const origin = new URL(req.url).origin;
            const shareUrl = `${origin}/brochure/${token}`;
            await sendEmail({
              to: operatorAction.email,
              subject: "Votre avis de valeur",
              html: `<p>Votre avis de valeur est disponible :</p><p><a href="${shareUrl}">Consulter la fiche</a></p>`,
            });
            actionBlock = `\n\nAction exécutée: fiche envoyée à ${operatorAction.email}. Réponds brièvement.`;
            actionHeaders = { "X-Cockpit-Action": "crm:send_estimation", "X-Cockpit-Value": operatorAction.email };
          }
        }
      }
    } catch (err) {
      console.error("[cockpit-chat] operator action failed", {
        tenant,
        action: operatorAction.kind,
        message: err instanceof Error ? err.message : "unknown",
      });
      actionBlock = "\n\nAction échouée côté serveur. Réponds que l'action n'a pas pu être exécutée et demande de vérifier les informations.";
    }
  }

  if (estimationId && action) {
    try {
      const estimation = await loadOwnedEstimation(sb, estimationId, userId, tenant);
      if (estimation) {
        const property = (estimation.property ?? {}) as PropertyData;
        const fieldStatus = (estimation.field_status ?? {}) as FieldStatusMap;
        const newProperty: PropertyData = { ...property, [action.field]: action.value };
        const newFieldStatus: FieldStatusMap = { ...fieldStatus, [action.field]: "answered" };
        const promotedCols =
          action.field === "type_bien"
            ? { property_type: action.value as string }
            : action.field === "surface_habitable_m2"
              ? { surface: action.value as number }
              : {};
        const { error } = await sb
          .from("estimations")
          .update({
            property: newProperty as unknown as Json,
            field_status: newFieldStatus as unknown as Json,
            ...promotedCols,
            status: "interviewing",
            updated_at: new Date().toISOString(),
          })
          .eq("id", estimationId)
          .eq("user_id", userId)
          .eq("tenant_id", tenant);

        if (error) {
          console.error("[cockpit-chat] estimation action failed", {
            estimationId,
            tenant,
            action: action.field,
            code: error.code,
          });
        } else {
          actionBlock = `\n\nAction exécutée: ${FIELD_LABELS[action.field] ?? action.field} = "${String(action.value)}" sur l'estimation courante. Réponds brièvement que c'est pris en compte et propose la prochaine information utile.`;
          actionHeaders = {
            "X-Cockpit-Action": `estimation:${String(action.field)}`,
            "X-Cockpit-Field": String(action.field),
            "X-Cockpit-Value": String(action.value),
            "X-Cockpit-Value-Type": action.valueType,
            "X-Estimation-Id": estimationId,
          };
        }
      }
    } catch (err) {
      console.error("[cockpit-chat] estimation action error", {
        estimationId,
        tenant,
        action: action.field,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  const system =
    "Tu es l'assistant Cockpit de Real estate Agent. Réponds en français, de façon concise et actionnable. Tu peux agir sur les données de l'application uniquement via les actions serveur autorisées et confirmées. Le contexte factuel de la page courante est prioritaire sur l'historique du chat. Si l'historique contredit ce contexte, ignore l'historique." +
    (estimationContextBlock ? `\n\n${estimationContextBlock}` : "") +
    (memoryBlock ? `\n\nMémoire de l'utilisateur :\n${memoryBlock}` : "") +
    actionBlock;

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
      ...actionHeaders,
    },
  });
}
