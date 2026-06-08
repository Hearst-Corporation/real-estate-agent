import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { generateMfaSecret, buildOtpauthUrl } from "@/lib/server/mfa";
import { savePendingSecret } from "@/lib/server/mfa-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/mfa/setup
 * Démarre l'enrôlement MFA : génère un secret TOTP, le stocke « en attente »,
 * et renvoie l'URL otpauth (à encoder en QR) + le secret (saisie manuelle).
 * Le MFA n'est PAS encore actif à ce stade — il faut confirmer via /enable.
 */
export async function POST() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const secret = generateMfaSecret();
  const saved = await savePendingSecret(claims.sub, secret);
  // savePendingSecret=false → table 0035 pas prête (ou DB indisponible) : on ne peut pas enrôler.
  if (!saved) return NextResponse.json({ error: "mfa_unavailable" }, { status: 503 });

  const label = claims.email || claims.sub;
  return NextResponse.json({
    otpauthUrl: buildOtpauthUrl(label, secret),
    secret,
  });
}
