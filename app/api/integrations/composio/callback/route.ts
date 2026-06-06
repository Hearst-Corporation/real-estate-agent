/**
 * GET /api/integrations/composio/callback
 *
 * Point d'entrée OAuth Composio après authentification.
 * Composio gère l'échange de token côté serveur ; ici on redirige simplement
 * l'utilisateur vers la page Profil avec un indicateur de succès.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const destination = new URL("/profile?connected=1", req.url);
  return NextResponse.redirect(destination);
}
