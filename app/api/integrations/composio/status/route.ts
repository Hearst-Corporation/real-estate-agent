/**
 * GET /api/integrations/composio/status
 *
 * Retourne l'état de connexion Composio de l'utilisateur connecté :
 * { gmail: boolean, calendar: boolean, configured: boolean }
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { connectionStatus, composioConfigured } from "@/lib/providers/composio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const configured = composioConfigured();

  if (!configured) {
    return NextResponse.json({ gmail: false, calendar: false, configured: false });
  }

  const status = await connectionStatus(claims.sub);

  return NextResponse.json({
    gmail: status.gmail,
    calendar: status.calendar,
    configured: true,
  });
}
