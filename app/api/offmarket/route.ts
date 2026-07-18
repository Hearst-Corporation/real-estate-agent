/**
 * /api/offmarket
 *
 * GET  ?propertyId=<uuid>
 *   → Matching off-market : pour un bien du portefeuille de l'agent, renvoie
 *     les acquéreurs (critères) qui matchent avec un score RÉEL calculé par le
 *     moteur de matching de la prospection. Owner-check strict + LIMIT.
 *
 * POST
 *   → Constitue une SÉLECTION partageable de biens pour un acquéreur, calcule
 *     le score réel de chaque bien vs le critère choisi, persiste la sélection,
 *     et renvoie un lien signé (token) consultable sans session.
 *
 * 401 avant tout accès DB · 503 database_not_configured · owner-check user+tenant
 * sur chaque requête · Zod · IDs crypto.randomUUID (dans la couche DB).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { matchPropertyToAcquereurs, type PropertyRow } from "@/lib/offmarket/matching";
import { createSelection } from "@/lib/offmarket/db";
import { signSelectionToken } from "@/lib/offmarket/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MATCH_LIMIT = 100;

// ─── GET : acquéreurs correspondant à un bien du portefeuille ─────────────────

export async function GET(req: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  const url = new URL(req.url);
  const propertyId = url.searchParams.get("propertyId");
  const parsedId = z.string().uuid().safeParse(propertyId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "invalid_property_id" }, { status: 400 });
  }

  // Owner-check strict sur le bien.
  const { data: property, error: propErr } = await sb
    .from("properties")
    .select("*")
    .eq("id", parsedId.data)
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .maybeSingle();

  if (propErr) return NextResponse.json({ error: "internal_error" }, { status: 500 });
  if (!property) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Critères acquéreurs actifs du même tenant (filtre tenant explicite).
  const { data: criteres, error: critErr } = await sb
    .from("prosp_criteres_acquereur")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("actif", true)
    .limit(500);

  if (critErr) return NextResponse.json({ error: "internal_error" }, { status: 500 });

  const matches = matchPropertyToAcquereurs(
    property as unknown as PropertyRow,
    (criteres ?? []) as Array<Record<string, unknown>>,
  ).slice(0, MATCH_LIMIT);

  return NextResponse.json({ propertyId: parsedId.data, matches });
}

// ─── POST : créer une sélection partageable pour un acquéreur ─────────────────

const CreateSelectionSchema = z
  .object({
    titre: z.string().trim().min(1).max(200),
    critereId: z.string().uuid().nullable().optional(),
    leadId: z.string().uuid().nullable().optional(),
    propertyIds: z.array(z.string().uuid()).min(1).max(50),
  })
  .strict();

export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  const raw = await req.json().catch(() => null);
  const parsed = CreateSelectionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { titre, propertyIds } = parsed.data;
  const critereId = parsed.data.critereId ?? null;
  const leadId = parsed.data.leadId ?? null;

  // Owner-check : tous les biens doivent appartenir à user+tenant.
  const { data: props, error: propErr } = await sb
    .from("properties")
    .select("*")
    .in("id", propertyIds)
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .limit(50);

  if (propErr) return NextResponse.json({ error: "internal_error" }, { status: 500 });
  const properties = (props ?? []) as unknown as PropertyRow[];
  if (properties.length !== propertyIds.length) {
    // Un bien manquant = pas au propriétaire → 404 sans révéler lequel.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Si un critère est fourni, il doit appartenir au tenant → sinon 404.
  let critereRow: Record<string, unknown> | null = null;
  if (critereId) {
    const { data: crit, error: critErr } = await sb
      .from("prosp_criteres_acquereur")
      .select("*")
      .eq("id", critereId)
      .eq("tenant_id", tenant)
      .maybeSingle();
    if (critErr) return NextResponse.json({ error: "internal_error" }, { status: 500 });
    if (!crit) return NextResponse.json({ error: "not_found" }, { status: 404 });
    critereRow = crit as Record<string, unknown>;
  }

  // Score RÉEL par bien vs critère (jamais inventé). Sans critère → score null.
  const items = properties.map((p) => {
    if (!critereRow) return { propertyId: p.id, scoreMatch: null, scoreBreakdown: {} };
    const matched = matchPropertyToAcquereurs(p, [critereRow])[0];
    return {
      propertyId: p.id,
      scoreMatch: matched ? matched.score : null,
      scoreBreakdown: matched ? matched.breakdown : {},
    };
  });

  // Jeton opaque non prédictible stocké en DB (ancre + révocation).
  const dbToken = crypto.randomUUID();

  const created = await createSelection(sb, {
    userId,
    tenantId: tenant,
    titre,
    leadId,
    critereId,
    shareToken: dbToken,
    items,
  });

  if (!created.ok) {
    if (created.reason === "unavailable") {
      return NextResponse.json({ error: "offmarket_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // JWT public référençant l'id de sélection.
  let token: string;
  try {
    token = await signSelectionToken(created.data.selectionId);
  } catch {
    return NextResponse.json({ error: "sharing_not_configured" }, { status: 503 });
  }

  const origin = new URL(req.url).origin;
  const shareUrl = `${origin}/offmarket/${token}`;

  return NextResponse.json({ selectionId: created.data.selectionId, shareUrl }, { status: 201 });
}
