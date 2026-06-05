/**
 * GET  /api/invest/investor/profile  — profil investisseur + plafonds (DB).
 * POST /api/invest/investor/profile  — crée/maj le profil ET soumet le test ECSP
 *                                      (WF-3) → classification + plafond
 *                                      max(1000€, 5% patrimoine net).
 *
 * Gardes (pattern app/api/visits/route.ts) :
 *   - getSession() → 401 si pas de session.
 *   - getSupabaseAdmin() → 503 si Supabase non configuré.
 *   - filtrage EXPLICITE user_id + tenant_id (service-role bypass RLS, I9).
 *   - zod sur tout le body ; erreurs JSON { error, detail }.
 *
 * Anti-FIA : aucune sélection de deal ici (I3). On borne la capacité de
 * souscription de l'investisseur, rien de plus.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import {
  supabaseInvestorStore,
  getOrCreateProfile,
  updateProfile,
  submitAssessment,
  type InvestorCtx,
} from "@/lib/invest/investor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const ctx: InvestorCtx = { userId: claims.sub, tenantId: tenantOf(claims) };
  try {
    const profile = await getOrCreateProfile(supabaseInvestorStore(), ctx);
    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json(
      { error: "fetch_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * Body :
 *   - profile : champs déclaratifs (full_name, country, investor_kind).
 *   - assessment (optionnel) : si présent → soumet le test ECSP. Montants en
 *     euros (numéros décimaux), convertis en centimes côté service.
 */
const BodySchema = z.object({
  profile: z
    .object({
      fullName: z.string().trim().min(1).max(160).optional(),
      country: z
        .string()
        .trim()
        .length(2)
        .regex(/^[A-Za-z]{2}$/, "ISO-3166 alpha-2")
        .optional(),
      investorKind: z.enum(["natural_person", "legal_entity"]).optional(),
    })
    .optional(),
  assessment: z
    .object({
      knowledgePassed: z.boolean(),
      knowledgeScore: z.number().min(0).max(100).optional(),
      declaresSophisticated: z.boolean().default(false),
      annualIncomeEur: z.number().min(0),
      liquidAssetsEur: z.number().min(0),
      financialCommitmentsEur: z.number().min(0),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ctx: InvestorCtx = { userId: claims.sub, tenantId: tenantOf(claims) };
  const store = supabaseInvestorStore();
  const { profile: profileInput, assessment } = parsed.data;

  try {
    // 1. Crée/maj le profil déclaratif si fourni (sinon garantit son existence).
    let profile = profileInput
      ? await updateProfile(store, ctx, profileInput)
      : await getOrCreateProfile(store, ctx);

    // 2. Soumet le test ECSP si présent (classification + plafond).
    let assessmentResult = null;
    if (assessment) {
      assessmentResult = await submitAssessment(store, ctx, {
        knowledgePassed: assessment.knowledgePassed,
        knowledgeScore: assessment.knowledgeScore ?? null,
        declaresSophisticated: assessment.declaresSophisticated,
        lossCapacity: {
          annualIncomeEur: Math.round(assessment.annualIncomeEur * 100),
          liquidAssetsEur: Math.round(assessment.liquidAssetsEur * 100),
          financialCommitmentsEur: Math.round(assessment.financialCommitmentsEur * 100),
        },
      });
      // Relit le profil pour refléter classe + plafond persistés.
      profile = await getOrCreateProfile(store, ctx);
    }

    return NextResponse.json({ profile, assessment: assessmentResult }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: "save_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
