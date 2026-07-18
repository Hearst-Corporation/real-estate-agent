import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getRunEvents } from "@/lib/aigent/runtime";
import { runtimeResultToResponse } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Forme de runId acceptée (contrat §2 : `^[a-z0-9-]{1,200}$`). */
const ID_RE = /^[a-z0-9-]{1,200}$/;

/**
 * GET /api/aigent/runs/[id]/events?after=<sequence> — événements ordonnés d'un
 * run (OUTBOUND, polling — contrat §6). Session-authed. `after` = curseur borné
 * (entier ≥ 0). État réel : 404 (aucun run store branché).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ ok: false, notFound: true }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const afterRaw = searchParams.get("after");
  let after: number | undefined;
  if (afterRaw !== null) {
    const n = Number.parseInt(afterRaw, 10);
    // Curseur invalide → ignoré (repart du début), jamais une 500.
    after = Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  const result = await getRunEvents(id, after);
  return runtimeResultToResponse(result);
}
