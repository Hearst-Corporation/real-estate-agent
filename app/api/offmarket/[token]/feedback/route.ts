/**
 * POST /api/offmarket/[token]/feedback
 *
 * Accès PUBLIC porté par le token signé (PAS de session). L'acquéreur donne un
 * verdict (interesse / pas_interesse / a_revoir) sur un bien de SA sélection.
 *
 * Sécurité :
 *   - token invalide/expiré → 404 (pas de fuite d'existence).
 *   - le verdict est borné à la sélection portée par le token : l'item doit
 *     appartenir à cette sélection (vérifié en DB), sinon 404 → aucune
 *     énumération d'items d'autres sélections possible.
 *   - Zod strict (enum verdict, commentaire borné).
 *   - erreurs génériques ; message DB neutre.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getGpu1Admin } from "@/lib/gpu1";
import { verifySelectionToken } from "@/lib/offmarket/share";
import { upsertFeedback } from "@/lib/offmarket/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    itemId: z.string().uuid(),
    verdict: z.enum(["interesse", "pas_interesse", "a_revoir"]),
    commentaire: z.string().trim().max(1000).optional(),
  })
  .strict();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const verified = await verifySelectionToken(token);
  if (!verified) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await upsertFeedback(sb, {
    selectionId: verified.selectionId,
    itemId: parsed.data.itemId,
    verdict: parsed.data.verdict,
    commentaire: parsed.data.commentaire ?? null,
  });

  if (!result.ok) {
    if (result.reason === "unavailable") {
      return NextResponse.json({ error: "offmarket_unavailable" }, { status: 503 });
    }
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, verdict: parsed.data.verdict });
}
