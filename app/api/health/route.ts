import { NextResponse } from "next/server";
import { providersStatus } from "@/lib/providers";
import { getSession } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const claims = await getSession();
    if (claims) {
      return NextResponse.json({
        ok: true,
        service: "real-estate-agent",
        providers: providersStatus(),
      });
    }
    return NextResponse.json({ ok: true, service: "real-estate-agent" });
  } catch {
    return NextResponse.json({ ok: true, service: "real-estate-agent" });
  }
}
