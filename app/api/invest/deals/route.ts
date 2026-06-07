/**
 * GET  /api/invest/deals  — catalogue des deals OUVERTS (investisseur).
 * POST /api/invest/deals  — crée un deal + son SPV + sa tranche (OPÉRATEUR/ADMIN).
 *
 * Gardes (pattern app/api/visits/route.ts + Epic 1.1) :
 *   - getSession() → 401 si pas de session.
 *   - getSupabaseAdmin() → 503 si Supabase non configuré.
 *   - POST : garde opérateur/admin (claims.role==="admin"|"operator" ou scope) → 403.
 *   - filtrage EXPLICITE tenant_id (service-role bypass RLS, I9).
 *   - zod sur tout le body ; idempotence I8 sur la création (`deal:create:{hash}`).
 *   - erreurs JSON { error, detail }.
 *
 * Anti-FIA : la liste investisseur ne renvoie QUE les deals `open` et n'applique
 * AUCUNE sélection/recommandation (I3).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import {
  supabaseDealStore,
  listDeals,
  createDealWithSpv,
  dealCreateIdemKey,
  type OperatorCtx,
  type CreateDealInput,
} from "@/lib/invest/deal";
import {
  withIdempotency,
  hashBody,
  supabaseIdempotencyStore,
} from "@/lib/invest/shared/idempotency";
import { ComplianceBlockedError, IdempotencyConflictError } from "@/lib/invest/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);
  try {
    // Investisseur : uniquement les deals ouverts (anti-FIA I3, pas de sélection).
    const items = await listDeals(supabaseDealStore(), tenantId, { statuses: ["open"] });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: "fetch_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// ─── POST : création back-office (opérateur/admin) ────────────────────────────

const PositiveEur = z.number().min(0);

const CreateSchema = z.object({
  spv: z.object({
    legalName: z.string().trim().min(1).max(200),
    legalForm: z.enum(["SAS", "SA"]).optional(),
    siren: z
      .string()
      .regex(/^[0-9]{9}$/, "SIREN = 9 chiffres")
      .nullish(),
    assetCity: z.string().trim().max(120).nullish(),
    seniorDebtAmountEur: PositiveEur.nullish(),
  }),
  deal: z.object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9-]+$/, "slug = minuscules, chiffres, tirets"),
    name: z.string().trim().min(1).max(200),
    dealType: z.enum(["marchand_de_biens", "promotion", "locatif", "value_add", "mixte"]),
    city: z.string().trim().max(120).nullish(),
    postalCode: z.string().trim().max(12).nullish(),
    acquisitionPriceEur: PositiveEur,
    notaryFeesEur: PositiveEur,
    worksBudgetEur: PositiveEur,
    otherCostsEur: PositiveEur,
    seniorDebtEur: PositiveEur,
    sponsorEquityEur: PositiveEur,
    appraisedValueEur: PositiveEur.nullish(),
    targetRaiseEur: z.number().positive(),
    minTicketEur: z.number().positive().optional(),
    maxTicketEur: z.number().positive().nullish(),
    durationMonths: z.number().int().positive(),
    // ANTI-FIA : règlement ∈ EUR/EURC/EURe (jamais USDT — CHECK DB).
    settlementCurrency: z.enum(["EUR", "EURC", "EURe"]).optional(),
    seniorRateAnnual: z.number().min(0).max(1).optional(),
    prixReventeCentralEur: PositiveEur.nullish(),
    loyerNetAnnuelEur: PositiveEur.nullish(),
  }),
  tranche: z.object({
    name: z.string().trim().min(1).max(160),
    seniority: z.enum(["senior_secured", "mezzanine", "junior", "subordinated"]).optional(),
    couponRatePct: z.number().min(0).max(100).nullish(),
    // ANTI-FIA : token ∈ ERC-3643/ERC-1400 (jamais 20/4626 — CHECK DB).
    tokenStandard: z.enum(["ERC-3643", "ERC-1400"]).optional(),
    nominalUnitEur: z.number().positive().optional(),
  }),
});

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // Garde back-office : opérateur ou admin uniquement (avant toute lecture body).
  const isOperator =
    claims.role === "admin" ||
    claims.role === "operator" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("operator");
  if (!isOperator) {
    return NextResponse.json({ error: "forbidden", detail: "operator_or_admin_required" }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.flatten() }, { status: 400 });
  }

  const tenantId = tenantOf(claims);
  const ctx: OperatorCtx = {
    userId: claims.sub,
    tenantId,
    role: claims.role,
    scope: claims.scope,
  };
  const input = parsed.data as CreateDealInput;

  try {
    // Idempotence I8 : double-clic / retry → même deal, pas de doublon.
    const { result, replayed } = await withIdempotency(
      supabaseIdempotencyStore(tenantId),
      { key: dealCreateIdemKey(input), bodyHash: hashBody(input) },
      () => createDealWithSpv(supabaseDealStore(), ctx, input),
    );
    return NextResponse.json({ deal: result, replayed }, { status: replayed ? 200 : 201 });
  } catch (e) {
    if (e instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: "idempotency_conflict" }, { status: 409 });
    }
    if (e instanceof ComplianceBlockedError) {
      return NextResponse.json({ error: "forbidden", detail: e.reason }, { status: 403 });
    }
    // Slug déjà pris (UNIQUE) → 409 explicite.
    const msg = e instanceof Error ? e.message : String(e);
    if (/uq_inv_deal_slug|duplicate key/i.test(msg)) {
      return NextResponse.json({ error: "slug_taken", detail: msg }, { status: 409 });
    }
    return NextResponse.json({ error: "create_failed", detail: msg }, { status: 500 });
  }
}
