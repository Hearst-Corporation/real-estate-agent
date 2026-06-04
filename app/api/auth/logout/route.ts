import { NextResponse } from "next/server";
import { clearTokenCookie } from "@/lib/server/auth-cookie";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  clearTokenCookie(res, req.headers.get("host"));
  return res;
}
