/**
 * POST /api/prospection/optout — enregistre un refus de démarchage (RGPD).
 *
 * Authentifié : l'agent note qu'un vendeur/contact a demandé à ne plus être
 * démarché. On stocke un HASH (jamais la PII en clair) + on bloque l'annonce si
 * fournie. Idempotent (index unique sur le hash).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { recordOptOut } from "@/lib/prospection/contact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(3).max(40).optional(),
    raison: z.string().trim().min(1).max(500).default("refus_demarchage"),
    source: z.string().trim().max(120).optional(),
    annonce_id: z.string().uuid().optional(),
  })
  .refine((b) => Boolean(b.email || b.phone || b.annonce_id), {
    message: "email, phone ou annonce_id requis",
  });

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const tenantId = tenantOf(claims);

  // Si annonce_id fourni, ownership : elle doit appartenir au tenant.
  if (body.annonce_id) {
    const { data, error } = await db
      .from("prosp_annonces")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", body.annonce_id)
      .limit(1);
    if (error) return NextResponse.json({ error: "internal_error" }, { status: 500 });
    if (!(data ?? [])[0]) {
      return NextResponse.json({ error: "annonce_not_found" }, { status: 404 });
    }
  }

  const res = await recordOptOut(db, tenantId, {
    email: body.email ?? null,
    phone: body.phone ?? null,
    raison: body.raison,
    source: body.source ?? "agent",
    annonceId: body.annonce_id ?? null,
  });

  if (!res.ok) {
    // Erreur générique côté client, détail loggé serveur (sans PII).
    console.error("[prospection/optout] recordOptOut failed:", res.error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
