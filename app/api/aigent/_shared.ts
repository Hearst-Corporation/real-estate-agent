import "server-only";

import { NextResponse } from "next/server";
import type { RuntimeResult } from "@/lib/aigent/runtime-types";

/**
 * Helpers partagés des routes proxy `/api/aigent/**` (OUTBOUND vers le registre).
 * =================================================================
 *
 * Les routes proxy sont session-authed : le token runtime Aigent reste
 * SERVER-ONLY (jamais renvoyé au client). Elles ne relaient QUE ce que le
 * registre renvoie réellement (liste vide / 404 / unavailable), sans rien
 * fabriquer. Cette factorisation garantit une forme de réponse cohérente et un
 * mapping unique de `RuntimeResult` → `NextResponse`.
 *
 * Contrat de forme (aligné registre §10) :
 *   - succès           → `{ ok:true, data }`                          200
 *   - registre vide    → `{ ok:true, data:[] }` (via listAgents)      200
 *   - unavailable      → `{ ok:false, unavailable:{ reason } }`       200 (état honnête, PAS une erreur HTTP)
 *   - not found (404)  → `{ ok:false, notFound:true }`                404
 *   - conflict (409)   → `{ ok:false, conflict:true }`                409
 *   - erreur transport → `{ error:"runtime_error" }`                  502
 *
 * Choix délibéré : `unavailable` est renvoyé en **200** avec un corps qualifié,
 * pas en 5xx — l'absence de raccordement Aigent n'est pas une panne de CE
 * service, c'est un état de première classe que l'UI rend honnêtement.
 */

/** Convertit un `RuntimeResult<T>` en réponse HTTP JSON uniforme. */
export function runtimeResultToResponse<T>(result: RuntimeResult<T>): NextResponse {
  if (result.ok) {
    return NextResponse.json({ ok: true, data: result.data });
  }
  if ("unavailable" in result) {
    return NextResponse.json({ ok: false, unavailable: { reason: result.unavailable.reason } });
  }
  if ("notFound" in result) {
    return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
  }
  if ("conflict" in result) {
    return NextResponse.json({ ok: false, conflict: true }, { status: 409 });
  }
  // Erreur transport générique — jamais de détail interne renvoyé au client.
  return NextResponse.json({ error: "runtime_error" }, { status: 502 });
}
