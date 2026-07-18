// app/api/timeline/route.ts — Timeline unifiée d'une entité (lead | property).
//
// GET /api/timeline?type=lead|property&id=<uuid>&limit=<n>
// Owner-check user_id + tenant_id (service-role bypasse la RLS → filtrage
// applicatif obligatoire, fait dans fetchTimeline). 401 avant tout accès DB.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { fetchTimeline } from "@/lib/timeline/fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  type: z.enum(["lead", "property"]),
  id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(req: NextRequest) {
  // 1) Auth AVANT toute DB.
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 2) Validation stricte des params (type/bornes/enum).
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    type: url.searchParams.get("type"),
    id: url.searchParams.get("id"),
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  try {
    const events = await fetchTimeline(
      sb,
      { type: parsed.data.type, id: parsed.data.id },
      claims.sub,
      tenantOf(claims),
      parsed.data.limit,
    );
    // null = entité inexistante ou non possédée par (user, tenant).
    if (events === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ items: events });
  } catch (e) {
    console.error("[timeline] unexpected error", { name: (e as Error)?.name });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
