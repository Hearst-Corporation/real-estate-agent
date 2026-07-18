import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getRun } from "@/lib/aigent/runtime";
import { runtimeResultToResponse } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Forme de runId acceptée (contrat §2 : `^[a-z0-9-]{1,200}$`). */
const ID_RE = /^[a-z0-9-]{1,200}$/;

/**
 * GET /api/aigent/runs/[id] — état d'un run (OUTBOUND).
 * Session-authed. Valide la forme du runId avant tout appel. État réel : 404
 * (aucun run store branché). Le registre re-vérifie l'appartenance projet.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ ok: false, notFound: true }, { status: 404 });

  const result = await getRun(id);
  return runtimeResultToResponse(result);
}
