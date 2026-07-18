import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { listAgents } from "@/lib/aigent/runtime";
import { RUNTIME_PROJECT_KEY } from "@/lib/aigent/runtime-types";
import { runtimeResultToResponse } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/aigent/agents — liste des agents publiés du projet (OUTBOUND).
 * Session-authed (401 avant tout appel). Le token runtime reste server-only.
 * Le projectKey est FIGÉ côté serveur (`RUNTIME_PROJECT_KEY`) — jamais choisi
 * par le client (pas de fuite inter-projets, contrat §11). État réel : liste
 * vide honnête tant qu'aucun agent n'est matérialisé côté Aigent.
 */
export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await listAgents(RUNTIME_PROJECT_KEY);
  return runtimeResultToResponse(result);
}
