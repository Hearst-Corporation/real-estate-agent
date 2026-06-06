/**
 * POST /api/integrations/composio/connect
 *
 * Initie la connexion OAuth Composio pour l'utilisateur connecté.
 * Body : { toolkit: "gmail" | "googlecalendar" }
 * Réponse : { redirectUrl } → l'UI doit rediriger l'utilisateur vers cette URL.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { initiateConnection } from "@/lib/providers/composio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ConnectSchema = z.object({
  toolkit: z.enum(["gmail", "googlecalendar"]).default("gmail"),
});

export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = ConnectSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const callbackUrl = `${appUrl}/api/integrations/composio/callback`;

  const result = await initiateConnection(
    claims.sub,
    body.data.toolkit,
    callbackUrl,
  );

  if ("error" in result) {
    const status = result.error === "auth_config_manquant" ? 503 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ redirectUrl: result.redirectUrl });
}
