/**
 * /api/onboarding/reset — permet de REJOUER une visite guidée (W2).
 *
 *   POST : supprime la progression owner-scopée du tour visé, afin que le
 *          moteur reparte de l'étape 0 au prochain lancement.
 *
 * ── FAIL-CLOSED ─────────────────────────────────────────────────────────────
 * 401 AVANT tout accès DB. Le DELETE est TOUJOURS borné par `tenant_id` +
 * `user_id` issus des claims de session — jamais du corps de la requête (schéma
 * `.strict()` : envoyer `tenant_id`/`user_id` produit un 400). Un utilisateur ne
 * peut donc réinitialiser que SA propre progression, dans SON tenant.
 *
 * ── DÉGRADATION HONNÊTE ─────────────────────────────────────────────────────
 * Si la migration 0059 n'est pas appliquée, la table n'existe pas : la réponse
 * porte `sync: "unsynced"` + `persisted: false`. Rien n'est effacé en base
 * (il n'y avait rien), et rien ne prétend l'avoir été — le moteur peut relancer
 * la visite pour la session courante en le sachant.
 *
 * ── SÉCURITÉ FONCTIONNELLE ──────────────────────────────────────────────────
 * Cette route ne touche QUE la table de progression du tour. Elle ne crée, ne
 * modifie et ne supprime AUCUNE donnée métier (leads, biens, mandats, visites…).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import {
  resetProgress,
  TOUR_KEY_RE,
  TOUR_VERSION_MAX,
  TOUR_PROGRESS_UNAVAILABLE_REASON,
} from "@/lib/onboarding/progress-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ResetSchema = z
  .object({
    tour_key: z.string().trim().min(1).max(64).regex(TOUR_KEY_RE, "tour_key must be a lowercase slug"),
    tour_version: z.number().int().min(1).max(TOUR_VERSION_MAX).optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  // 1) Session obligatoire — AVANT tout accès DB.
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = ResetSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  // 2) Identité IMPOSÉE par le serveur — le DELETE ne peut pas déborder du user.
  const res = await resetProgress(db, tenantOf(claims), claims.sub, {
    tourKey: parsed.data.tour_key,
    tourVersion: parsed.data.tour_version,
  });

  if (!res.ok) {
    if (res.reason === "unavailable") {
      return NextResponse.json({
        cleared: false,
        sync: "unsynced",
        persisted: false,
        reason: TOUR_PROGRESS_UNAVAILABLE_REASON,
      });
    }
    console.error("[onboarding] progress reset failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ cleared: true, sync: "synced", persisted: true });
}
