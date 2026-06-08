import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { createMission } from "@/lib/missions/service";
import { tenantOf, uuidOwnerOf } from "@/lib/tenant";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// L'architect (LLM) prend 60-90s, + createSwarm + kickoff.
export const maxDuration = 120;

const MISSION_RL_MAX = 5;
const MISSION_RL_WINDOW_S = 60;

// ─── POST /api/missions — lance une mission (objectif → plan → swarm → run) ───
export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  if (!(await rateLimit(`mission:${claims.sub}`, MISSION_RL_MAX, MISSION_RL_WINDOW_S))) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: { objective?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.objective || typeof body.objective !== "string" || body.objective.trim() === "") {
    return NextResponse.json({ error: "objective_required" }, { status: 400 });
  }

  const idn = { userId: claims.sub, tenant: tenantOf(claims), ownerId: uuidOwnerOf(claims) };
  const res = await createMission(sb, idn, { objective: body.objective, title: body.title });
  if ("error" in res) {
    return NextResponse.json({ error: "mission_failed", detail: res.error }, { status: 502 });
  }
  return NextResponse.json({ id: res.id }, { status: 201 });
}
