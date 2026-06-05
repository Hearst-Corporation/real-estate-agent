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
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
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
  confirmedBlocks: number[],
  fieldStatus: FieldStatusMap,
  property: PropertyData
): string {
  const currentBlock = (confirmedBlocks.length + 1).toString();

  const emptyFields = (Object.keys(property) as (keyof PropertyData)[]).filter(
    (k) => {
      const v = property[k];
      if (Array.isArray(v)) return v.length === 0;
      return v === null || v === undefined;
    }
  );

  const toConfirmCount = Object.values(fieldStatus).filter(
    (s) => s === "to_confirm"
  ).length;

  return `[ÉTAT: bloc=${currentBlock}; champs vides=${emptyFields.length}; à confirmer global=${toConfirmCount}]`;
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
  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json(
      { error: "supabase_not_configured" },
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

  // Persist user message
  await sb.from("estimation_messages").insert({
    estimation_id: id,
    tenant_id: tenant,
    user_id: userId,
    role: "user",
    content: userMessage,
  });

  // Load history (ordered)
  const { data: rawHistory } = await sb
    .from("estimation_messages")
    .select("role, content")
    .eq("estimation_id", id)
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: true });

  const history = (rawHistory ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.content !== null)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    }));

  // State
  const property = (estimation.property ?? {}) as PropertyData;
  const fieldStatus = (estimation.field_status ?? {}) as FieldStatusMap;
  const confirmedBlocks = Array.isArray(estimation.confirmed_blocks)
    ? (estimation.confirmed_blocks as number[])
    : [];

  const stateHeader = buildStateHeader(confirmedBlocks, fieldStatus, property);
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
        });

        // Truncation guard (max_tokens / length → don't persist truncated tool_input)
        const isTruncated =
          stopReason === "max_tokens" || stopReason === "length";

        let newProperty = { ...property };
        let newFieldStatus = { ...fieldStatus };
        let newConfirmedBlocks = [...confirmedBlocks];

        if (!isTruncated && toolInput !== null) {
          const merged = mergeToolInput(newProperty, newFieldStatus, toolInput);
          newProperty = merged.property;
          newFieldStatus = merged.fieldStatus;

          // Advance confirmed block if current_block provided
          const currentBlock =
            typeof (toolInput as Record<string, unknown>)?.current_block ===
            "number"
              ? ((toolInput as Record<string, unknown>).current_block as number)
              : null;

          if (
            currentBlock !== null &&
            !newConfirmedBlocks.includes(currentBlock)
          ) {
            newConfirmedBlocks = [...newConfirmedBlocks, currentBlock];
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
                ? (toolInput as import("@/lib/supabase/database.types").Json)
                : null,
            });

            // Update estimation row
            const promotedCols = extractPropertyRow(newProperty);
            await sb
              .from("estimations")
              .update({
                property: newProperty as unknown as import("@/lib/supabase/database.types").Json,
                field_status: newFieldStatus as unknown as import("@/lib/supabase/database.types").Json,
                confirmed_blocks: newConfirmedBlocks as unknown as import("@/lib/supabase/database.types").Json,
                status: "interviewing",
                ...promotedCols,
                updated_at: new Date().toISOString(),
              })
              .eq("id", id);
          }
        }

        // canGenerate: all 9 blocks confirmed
        const canGenerate = newConfirmedBlocks.length >= 9;
        const currentBlock = newConfirmedBlocks.length + 1;

        enqueueFrame({
          type: "state",
          property: newProperty,
          fieldStatus: newFieldStatus,
          block: Math.min(currentBlock, 9),
          canGenerate,
        });

        enqueueFrame({ type: "done" });
      } catch (err) {
        enqueueFrame({
          type: "error",
          message: err instanceof Error ? err.message : "stream_error",
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
