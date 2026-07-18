/**
 * /api/value-evolution/relance — RELANCE propriétaire depuis une variation de valeur.
 *
 *   POST : crée un BROUILLON (outbox_drafts, status='draft') pour un bien dont la
 *          valeur estimée a varié significativement. AUCUN envoi — brouillon seul,
 *          validation humaine ultérieure requise (HITL).
 *
 * Vérité obligatoire : le corps du brouillon est RECALCULÉ serveur à partir des
 * estimations réelles (owner-scoped). Le client ne fournit QUE la clé de série à
 * relancer — jamais la valeur, jamais le texte : impossible d'inventer une variation.
 *
 * Fail-closed : 401 avant DB, owner-check tenant_id + user_id, Zod strict, ID uuid.
 * Table estimations/outbox absente → UNAVAILABLE honnête. Aucun secret renvoyé.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin, type Gpu1Client } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { loadValueSeries, relanceFromSeries } from "@/lib/value-evolution";
import { isSchemaMissing } from "@/lib/outbox/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  /** Clé de série à relancer (retournée par GET /api/value-evolution). */
  series_key: z.string().trim().min(1).max(300),
  /** Canal du brouillon (email par défaut). */
  channel: z.enum(["email", "sms", "whatsapp"]).default("email"),
});

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const raw = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { series_key, channel } = parsed.data;
  const tenantId = tenantOf(claims);
  const userId = claims.sub;

  // Recalcul serveur : on retrouve la série owner-scopée et on vérifie qu'elle est
  // BIEN significative. Impossible de forcer une relance sur un bien qui n'a pas bougé.
  const res = await loadValueSeries(db, tenantId, userId);
  if (!res.ok) {
    if (res.reason === "unavailable") {
      return NextResponse.json({ error: "value_evolution_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const series = res.series.find((s) => s.key === series_key);
  if (!series) return NextResponse.json({ error: "series_not_found" }, { status: 404 });

  const relance = relanceFromSeries(series);
  if (!relance) {
    return NextResponse.json({ error: "variation_not_significant" }, { status: 409 });
  }

  // Insert owner-scopé du brouillon. status='draft' — aucun envoi ici.
  const from = (db as unknown as { from: Gpu1Client["from"] }).from.bind(db);
  const { data, error } = await from("outbox_drafts" as never)
    .insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      lead_id: relance.ownerLeadId ?? null,
      channel,
      subject: channel === "email" ? relance.subject : null,
      body: relance.body,
      status: "draft",
    })
    .select(
      "id,lead_id,channel,subject,body,status,provider,provider_ref,error,created_at,updated_at,sent_at",
    )
    .single();

  if (error) {
    if (isSchemaMissing((error as { code?: string }).code)) {
      return NextResponse.json({ error: "outbox_unavailable" }, { status: 503 });
    }
    console.error("[value-evolution/relance] draft failed:", (error as { message?: string }).message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ draft: data, variation: relance.variation }, { status: 201 });
}
