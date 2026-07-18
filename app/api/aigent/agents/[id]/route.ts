import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getAgent } from "@/lib/aigent/runtime";
import { runtimeResultToResponse } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Forme d'id acceptée (contrat §2 : `^[a-z0-9-]{1,200}$`). */
const ID_RE = /^[a-z0-9-]{1,200}$/;

/**
 * GET /api/aigent/agents/[id] — détail d'un agent publié (OUTBOUND).
 * Session-authed. Valide la forme de l'id AVANT tout appel. État réel : 404
 * (aucun agent matérialisé). Le registre re-vérifie l'appartenance projet.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ ok: false, notFound: true }, { status: 404 });

  const result = await getAgent(id);
  return runtimeResultToResponse(result);
}
