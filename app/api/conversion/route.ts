// app/api/conversion/route.ts — Rapport de conversion pour un segment + période.
//
// GET /api/conversion?segment=all|acheteur|vendeur&grain=month|quarter&offset=<n>
// 401 AVANT toute DB. Owner-check user_id + tenant_id appliqué dans fetch.ts
// (service-role bypasse la RLS → filtrage applicatif obligatoire). Lecture seule.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { fetchConversionSources } from "@/lib/conversion/fetch";
import { computeConversion } from "@/lib/conversion/pipeline";
import { periodBounds } from "@/lib/conversion/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  segment: z.enum(["all", "acheteur", "vendeur"]).default("all"),
  grain: z.enum(["month", "quarter"]).default("month"),
  offset: z.coerce.number().int().min(0).max(11).default(0),
});

export async function GET(req: NextRequest) {
  // 1) Auth AVANT toute DB.
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 2) Validation stricte (enums + bornes).
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    segment: url.searchParams.get("segment") ?? undefined,
    grain: url.searchParams.get("grain") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const { from, to } = periodBounds({ grain: parsed.data.grain, offset: parsed.data.offset });

  try {
    const sources = await fetchConversionSources(sb, claims.sub, tenantOf(claims), from, to);
    if (sources === null) {
      return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
    }
    const report = computeConversion(sources, {
      segment: parsed.data.segment,
      grain: parsed.data.grain,
      from,
      to,
    });
    return NextResponse.json({ report });
  } catch (e) {
    console.error("[conversion] unexpected error", { name: (e as Error)?.name });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
