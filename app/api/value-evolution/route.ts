/**
 * /api/value-evolution — VALEUR IMMOBILIÈRE ÉVOLUTIVE (W6).
 *
 *   GET : séries d'évolution de valeur du tenant (dérivées des estimations),
 *         + opportunités de relance (variations significatives). LECTURE seule.
 *
 * Fail-closed : 401 avant tout accès DB, owner-check tenant_id + user_id sur la
 * requête, seuils bornés/validés. Table absente → UNAVAILABLE honnête (jamais de
 * crash). Aucun secret renvoyé, aucun envoi — les relances sont des propositions.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { DEFAULT_THRESHOLDS, loadValueSeries, relanceOpportunities } from "@/lib/value-evolution";
import { SERIES_LIMIT } from "@/config/value-evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Parse un seuil numérique borné depuis un query param (sinon défaut config). */
function boundedFloat(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
function boundedInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export async function GET(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const thresholds = {
    pct: boundedFloat(searchParams.get("pct"), DEFAULT_THRESHOLDS.pct, 0.1, 100),
    minEur: boundedInt(searchParams.get("min_eur"), DEFAULT_THRESHOLDS.minEur, 0, 100_000_000),
    minPoints: boundedInt(searchParams.get("min_points"), DEFAULT_THRESHOLDS.minPoints, 2, 100),
  };

  const res = await loadValueSeries(db, tenantOf(claims), claims.sub, { thresholds });
  if (!res.ok) {
    if (res.reason === "unavailable") {
      return NextResponse.json({
        series: [],
        opportunities: [],
        unavailable: true,
        reason: "estimations_schema_missing",
      });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const series = res.series.slice(0, SERIES_LIMIT);
  return NextResponse.json({
    series,
    opportunities: relanceOpportunities(series),
    thresholds,
  });
}
