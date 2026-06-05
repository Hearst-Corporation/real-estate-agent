/**
 * POST /api/invest/wallets — lie une adresse EVM au profil investisseur.
 *
 * - getSession() → 401 ; getSupabaseAdmin() → 503.
 * - zod : adresse EVM stricte `^0x[a-fA-F0-9]{40}$` (miroir du CHECK DB).
 * - Filtrage user_id + tenant_id explicite (service-role, I9).
 *
 * Pilote : saisie manuelle de l'adresse (PAS de wallet-connect on-chain). Le
 * claim ONCHAINID (KYC soulbound) est déclenché plus tard, à l'approbation KYC.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import {
  supabaseInvestorStore,
  linkWallet,
  type InvestorCtx,
} from "@/lib/invest/investor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  walletAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, "adresse EVM invalide (0x + 40 hex)"),
  walletKind: z.enum(["self_custody", "embedded"]).default("self_custody"),
});

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ctx: InvestorCtx = { userId: claims.sub, tenantId: tenantOf(claims) };

  try {
    const profile = await linkWallet(supabaseInvestorStore(), ctx, {
      walletAddress: parsed.data.walletAddress,
      walletKind: parsed.data.walletKind,
    });
    return NextResponse.json({ profile }, { status: 200 });
  } catch (e) {
    // Conflit d'unicité (un wallet déjà lié à un autre profil du tenant).
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate key|unique/i.test(msg)) {
      return NextResponse.json({ error: "wallet_already_linked", detail: msg }, { status: 409 });
    }
    return NextResponse.json({ error: "link_failed", detail: msg }, { status: 500 });
  }
}
