/**
 * /api/onboarding/progress — progression des visites guidées produit (W2).
 *
 *   GET : progression de l'utilisateur COURANT (option `tour_key`).
 *   PUT : upsert de la progression sur (tenant_id, user_id, tour_key, tour_version).
 *
 * ── FAIL-CLOSED ─────────────────────────────────────────────────────────────
 * 401 AVANT tout accès DB. `tenant_id` et `user_id` sont IMPOSÉS par le serveur
 * depuis les claims de session (`tenantOf(claims)` / `claims.sub`) et ne sont
 * JAMAIS lus depuis le corps ou la query — les schémas Zod sont `.strict()`,
 * donc un client qui tente de les envoyer reçoit 400. Erreurs génériques 500,
 * message DB neutre `database_not_configured`.
 *
 * ── DÉGRADATION HONNÊTE ─────────────────────────────────────────────────────
 * Tant que la migration 0059 n'est pas appliquée, la table n'existe pas. La
 * réponse porte alors `sync: "unsynced"` + `persisted: false` + une raison
 * explicite : la visite reste jouable pour la session courante, mais AUCUN faux
 * succès n'est renvoyé et rien ne prétend avoir été enregistré.
 *
 * ── ZÉRO PII ────────────────────────────────────────────────────────────────
 * Seules des clés de tour (slug borné par regex) et des compteurs transitent.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import {
  readProgress,
  upsertProgress,
  TOUR_PROGRESS_STATUSES,
  TOUR_KEY_RE,
  TOUR_STEP_MAX,
  TOUR_VERSION_MAX,
  TOUR_PROGRESS_UNAVAILABLE_REASON,
  type TourProgressStatus,
} from "@/lib/onboarding/progress-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Slug technique borné — miroir du CHECK SQL. Aucune PII ne peut y entrer. */
const TourKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(TOUR_KEY_RE, "tour_key must be a lowercase slug");

const StatusSchema = z.enum(
  TOUR_PROGRESS_STATUSES as unknown as [TourProgressStatus, ...TourProgressStatus[]],
);

/**
 * `.strict()` : tout champ hors liste (dont `tenant_id` / `user_id` / `started_at`)
 * fait échouer la validation en 400. L'identité et les horodatages ne sont donc
 * PAS acceptables depuis le navigateur — ils viennent des claims et du trigger DB.
 */
const UpsertSchema = z
  .object({
    tour_key: TourKeySchema,
    tour_version: z.number().int().min(1).max(TOUR_VERSION_MAX).optional(),
    status: StatusSchema,
    current_step: z.number().int().min(0).max(TOUR_STEP_MAX),
  })
  .strict();

const QuerySchema = z.object({ tour_key: TourKeySchema.optional() }).strict();

export async function GET(req: NextRequest) {
  // 1) Session obligatoire — AVANT tout accès DB.
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rawKey = searchParams.get("tour_key");
  const parsed = QuerySchema.safeParse(rawKey == null ? {} : { tour_key: rawKey });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  // 2) Identité IMPOSÉE par le serveur : jamais lue depuis la requête.
  const res = await readProgress(db, tenantOf(claims), claims.sub, {
    tourKey: parsed.data.tour_key,
  });

  if (!res.ok) {
    if (res.reason === "unavailable") {
      // Table absente (0059 non appliquée) → état honnête, pas une erreur fatale.
      return NextResponse.json({
        entries: [],
        sync: "unsynced",
        persisted: false,
        reason: TOUR_PROGRESS_UNAVAILABLE_REASON,
      });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ entries: res.entries, sync: "synced", persisted: true });
}

export async function PUT(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const body = parsed.data;
  const res = await upsertProgress(db, tenantOf(claims), claims.sub, {
    tourKey: body.tour_key,
    tourVersion: body.tour_version ?? 1,
    status: body.status,
    currentStep: body.current_step,
  });

  if (!res.ok) {
    if (res.reason === "unavailable") {
      // ⚠️ Rien n'a été écrit. On le DIT : entry null, persisted false.
      return NextResponse.json({
        entry: null,
        sync: "unsynced",
        persisted: false,
        reason: TOUR_PROGRESS_UNAVAILABLE_REASON,
      });
    }
    console.error("[onboarding] progress upsert failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ entry: res.entry, sync: "synced", persisted: true });
}
