import { NextResponse } from "next/server";
import { providersStatus } from "@/lib/providers";
import { getSession } from "@/lib/server/session";

export const runtime = "nodejs";

// Statut providers = booléens uniquement (jamais de secret), et seulement si
// authentifié. no-store : un health check ne doit jamais être mis en cache.
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  try {
    const claims = await getSession();
    if (claims) {
      return NextResponse.json(
        { ok: true, service: "real-estate-agent", providers: providersStatus() },
        { headers: NO_STORE },
      );
    }
    return NextResponse.json({ ok: true, service: "real-estate-agent" }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: true, service: "real-estate-agent" }, { headers: NO_STORE });
  }
}
