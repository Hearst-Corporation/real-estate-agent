import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { decideApproval } from "@/lib/approvals/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

/**
 * POST /api/approvals/[id] — DÉCISION HUMAINE sur une action d'agent en attente.
 * =============================================================================
 * Owner-check STRICT : 401 avant DB, filtrage `tenant_id` + `id` sur l'update,
 * décision persistée atomiquement (usage unique, pas de double-décision).
 * N'EXÉCUTE PAS l'action : approve → 'approved' (la gateway pourra la consommer),
 * reject → 'rejected'. Aucun envoi réel ici, jamais de faux « envoyé ».
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const result = await decideApproval(db, {
    id,
    tenantId: tenantOf(claims),
    deciderUserId: claims.sub,
    decision: parsed.data.decision,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (result.reason === "already_decided") {
      return NextResponse.json({ error: "already_decided" }, { status: 409 });
    }
    // unavailable — table non déployée / DB indisponible.
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    status: parsed.data.decision === "approve" ? "approved" : "rejected",
  });
}
