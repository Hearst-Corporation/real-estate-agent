import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { resumeRun } from "@/lib/aigent/runtime";
import { runtimeResultToResponse } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Forme de runId acceptée (contrat §2 : `^[a-z0-9-]{1,200}$`). */
const ID_RE = /^[a-z0-9-]{1,200}$/;

/**
 * Décision humaine HITL (contrat §7) : approuver / modifier / refuser. `payload`
 * opaque optionnel (paramètres modifiés). `reason` borné (audit) — pas de PII
 * imposée. C'est CETTE validation humaine persistée côté registre qui débloque
 * une action à effet réel (invariant du brief : aucun envoi sans validation).
 */
const BODY = z.object({
  action: z.enum(["approve", "modify", "reject"]),
  payload: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().trim().max(2000).optional(),
});

/**
 * POST /api/aigent/runs/[id]/resume — reprend un run en attente d'input avec la
 * décision de l'acteur humain (OUTBOUND, HITL, mutation). Session-authed (401
 * avant tout). Valide runId + corps AVANT tout appel. 409 si le run n'est pas
 * `waiting_on_input`. État réel : 404 (aucun run store branché).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ ok: false, notFound: true }, { status: 404 });

  const raw = await req.json().catch(() => null);
  const parsed = BODY.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const result = await resumeRun(id, parsed.data);
  return runtimeResultToResponse(result);
}
