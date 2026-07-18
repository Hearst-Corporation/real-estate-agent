/**
 * POST /api/estimations/[id]/interview
 *
 * Stream NDJSON d'un tour d'entretien immobilier — provider-agnostique.
 * Frames émises :
 *   { type: "text",  delta: string }            — texte LLM en cours
 *   { type: "state", property, fieldStatus, block, canGenerate }  — état final
 *   { type: "done" }                             — fermeture du stream
 *
 * IMPORTANT :
 * - Le merge de la donnée structurée se fait sur le tool_input complet,
 *   JAMAIS sur des deltas partiels (tronqués/non fiables).
 * - Jamais de `temperature` passé au LLM.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import {
  coverageOf,
  canGenerate as canGenerateFromFields,
  nextSuggestions,
  nextFocusLabel,
  inferCriticalFromText,
  answeredRecapFields,
  toConfirmLabels,
} from "@/lib/estimation/spec";
import { rateLimit } from "@/lib/ratelimit";
import {
  interviewIsConfigured,
  buildSystemPrompt,
  streamInterviewTurn,
  mergeToolInput,
} from "@/lib/ai/interview";
import type { PropertyData, FieldStatusMap } from "@/lib/estimation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Validation ───────────────────────────────────────────────────────────────

const BodySchema = z.object({
  message: z.string().min(1).max(8000),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildStateHeader(
  fieldStatus: FieldStatusMap,
  property: PropertyData
): string {
  const answered = answeredRecapFields(property);
  const toConfirm = toConfirmLabels(property, fieldStatus);
  const focus = nextFocusLabel(property, fieldStatus);
  const ready = canGenerateFromFields(property);

  // FICHE explicite : le modèle « voit » chaque champ déjà connu = valeur → il ne
  // redemande pas et enchaîne sur le prochain champ absent. Les compteurs abstraits
  // ne suffisaient pas (il ne savait pas CE qu'il savait déjà). Cette fiche porte
  // tout l'état, même quand l'historique de messages est tronqué (MAX_HISTORY).
  const lines: string[] = [];

  if (answered.length > 0) {
    lines.push("[FICHE DÉJÀ REMPLIE — NE REDEMANDE AUCUN de ces champs]");
    for (const { label, value } of answered) {
      lines.push(`- ${label} : ${value}`);
    }
  } else {
    lines.push(
      "[FICHE DÉJÀ REMPLIE — aucune info collectée pour l'instant, commence la collecte]"
    );
  }

  if (toConfirm.length > 0) {
    lines.push(
      `[À CONFIRMER — le vendeur ne connaît pas ces champs, ne les redemande pas : ${toConfirm.join(", ")}]`
    );
  }

  lines.push(
    focus
      ? `[PROCHAINE PRIORITÉ : ${focus}]`
      : "[PROCHAINE PRIORITÉ : toutes les infos clés sont réunies → fais le récap final]"
  );
  lines.push(
    `[ESSENTIELS RÉUNIS (génération possible) : ${ready ? "oui" : "non"}]`
  );

  return lines.join("\n");
}

function extractPropertyRow(property: PropertyData) {
  return {
    city: property.ville ?? null,
    postal_code: property.code_postal ?? null,
    property_type: property.type_bien ?? null,
    surface: property.surface_habitable_m2 ?? null,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  // Auth
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // LLM provider check
  if (!interviewIsConfigured()) {
    return NextResponse.json(
      { error: "interview_not_configured" },
      { status: 503 }
    );
  }

  // Supabase
  const sb = getGpu1Admin();
  if (!sb) {
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503 }
    );
  }

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  // Ownership check
  const estimation = await loadOwnedEstimation(sb, id, userId, tenant);
  if (!estimation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Rate-limit (30 req / 60 s per user)
  const allowed = await rateLimit(`interview:${userId}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Body validation
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const userMessage = parsed.data.message;

  // Load history AVANT d'insérer le message courant (sinon il est dupliqué :
  // une fois dans l'historique, une fois passé en userMessage).
  const { data: rawHistory } = await sb
    .from("estimation_messages")
    .select("role, content")
    .eq("estimation_id", id)
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: true });

  // Persist user message
  await sb.from("estimation_messages").insert({
    estimation_id: id,
    tenant_id: tenant,
    user_id: userId,
    role: "user",
    content: userMessage,
  });

  // Plafond d'historique : au-delà, le prefill explose (latence + coût) et le
  // modèle re-raisonne sur tout. L'état (bloc, champs, fiche) est porté par le
  // stateHeader + la fiche persistée, donc les anciens tours sont redondants.
  const MAX_HISTORY_MESSAGES = 12;
  const history = (rawHistory ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.content !== null)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    }))
    .slice(-MAX_HISTORY_MESSAGES);

  // State
  const property = (estimation.property ?? {}) as PropertyData;
  const fieldStatus = (estimation.field_status ?? {}) as FieldStatusMap;

  const stateHeader = buildStateHeader(fieldStatus, property);
  const system = buildSystemPrompt();

  const encoder = new TextEncoder();
  let assistantText = "";
  let persistDone = false;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueueFrame = (frame: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
      };

      try {
        // Provider-agnostic streaming turn
        const { toolInput, stopReason } = await streamInterviewTurn({
          system,
          history,
          stateHeader,
          userMessage,
          onText: (delta) => {
            assistantText += delta;
            enqueueFrame({ type: "text", delta });
          },
          onReasoning: (delta) => {
            // Raisonnement live (non persisté) — feedback « réflexion… ».
            enqueueFrame({ type: "reasoning", delta });
          },
        });

        // Truncation guard (max_tokens / length → don't persist truncated tool_input)
        const isTruncated =
          stopReason === "max_tokens" || stopReason === "length";

        let newProperty = { ...property };
        let newFieldStatus = { ...fieldStatus };

        if (!isTruncated && toolInput !== null) {
          const merged = mergeToolInput(newProperty, newFieldStatus, toolInput);
          newProperty = merged.property;
          newFieldStatus = merged.fieldStatus;
        }

        // Backstop déterministe : comble les champs CRITIQUES (type de bien,
        // surface) que le modèle aurait oubliés alors qu'ils sont explicites
        // dans le message du vendeur. N'écrase jamais une valeur déjà extraite.
        if (!isTruncated) {
          const inferred = inferCriticalFromText(userMessage, newProperty);
          for (const [k, v] of Object.entries(inferred)) {
            (newProperty as Record<string, unknown>)[k] = v;
            (newFieldStatus as Record<string, string>)[k] = "answered";
          }
        }

        // Persist assistant message + optional tool_input
        if (!persistDone) {
          persistDone = true;

          if (!isTruncated) {
            await sb.from("estimation_messages").insert({
              estimation_id: id,
              tenant_id: tenant,
              user_id: userId,
              role: "assistant",
              content: assistantText || null,
              tool_input: toolInput
                ? (toolInput as import("@/lib/gpu1/database.types").Json)
                : null,
            });

            // Update estimation row
            const promotedCols = extractPropertyRow(newProperty);
            await sb
              .from("estimations")
              .update({
                property: newProperty as unknown as import("@/lib/gpu1/database.types").Json,
                field_status: newFieldStatus as unknown as import("@/lib/gpu1/database.types").Json,
                status: "interviewing",
                ...promotedCols,
                updated_at: new Date().toISOString(),
              })
              .eq("id", id);
          }
        }

        // Génération débloquée dès que les champs CRITIQUES sont réunis
        // (type de bien, surface, localisation). Cohérent avec le SSR de
        // la page détail — plus de désaccord 8 vs 9 blocs.
        const coverage = coverageOf(newProperty, newFieldStatus);
        const canGenerate = canGenerateFromFields(newProperty);
        const nextLabel = nextFocusLabel(newProperty, newFieldStatus);

        // Réponses rapides proposées par l'agent (chips cliquables)
        const rawSuggestions =
          !isTruncated && toolInput
            ? (toolInput as Record<string, unknown>).suggestions
            : null;
        const agentSuggestions = Array.isArray(rawSuggestions)
          ? rawSuggestions
              .filter((s): s is string => typeof s === "string")
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
              .slice(0, 12)
          : [];

        // Fallback déterministe ALIGNÉ : options du 1er champ prioritaire non
        // traité. L'agent posant ses questions dans le même ordre de priorité,
        // les chips collent à la question affichée.
        const suggestions =
          agentSuggestions.length > 0
            ? agentSuggestions
            : nextSuggestions(newProperty, newFieldStatus);

        enqueueFrame({
          type: "state",
          property: newProperty,
          fieldStatus: newFieldStatus,
          coverage,
          canGenerate,
          suggestions,
          nextLabel,
        });

        enqueueFrame({ type: "done" });
      } catch (err) {
        console.error("[interview/route] stream error:", err);
        enqueueFrame({
          type: "error",
          message: "stream_error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Estimation-Id": id,
    },
  });
}
