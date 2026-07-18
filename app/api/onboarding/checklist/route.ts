/**
 * GET /api/onboarding/checklist — checklist de démarrage (W6).
 *
 * ── FAIL-CLOSED ─────────────────────────────────────────────────────────────
 * 401 AVANT tout accès DB. `tenant_id` / `user_id` sont IMPOSÉS depuis les
 * claims de session (`tenantOf(claims)` / `claims.sub`) : la requête ne peut
 * fournir aucune identité, et aucun paramètre n'est accepté (query ignorée).
 *
 * ── LECTURE SEULE ───────────────────────────────────────────────────────────
 * Cette route N'EXPOSE QUE `GET`. Aucun verbe mutant n'est exporté : POST/PUT/
 * PATCH/DELETE répondent 405 par défaut côté Next. La couche sous-jacente
 * (`checklist-db.ts`) ne fait que des `select` — la checklist observe, elle ne
 * crée rien à la place de l'utilisateur.
 *
 * ── ZÉRO PII ────────────────────────────────────────────────────────────────
 * La réponse ne contient QUE des identifiants d'items techniques, des états
 * (`done`/`todo`/`unknown`) et des compteurs bornés à 99. Aucun nom, aucune
 * adresse, aucun montant, aucun identifiant d'entité.
 *
 * ── DÉGRADATION HONNÊTE ─────────────────────────────────────────────────────
 * Table absente sur l'environnement (outbox_drafts, prosp_*, progression 0059)
 * → l'item vaut `unknown` avec sa raison. Jamais « fait » par défaut, et la
 * checklist ne se déclare jamais `completed` tant qu'un item est indéterminé.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { buildChecklist } from "@/lib/onboarding/checklist-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // 1) Session obligatoire — AVANT tout accès DB.
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  try {
    // 2) Identité IMPOSÉE par le serveur : jamais lue depuis la requête.
    const summary = await buildChecklist(db, tenantOf(claims), claims.sub);
    return NextResponse.json(summary);
  } catch {
    // Log serveur neutre, réponse générique : aucun détail DB ne sort.
    console.error("[onboarding] checklist build failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
