/**
 * /api/tasks — CRUD des tâches persistées (rea_tasks), moteur du centre d'actions.
 *
 * Sécurité (fail-closed) :
 *   - getSession() → 401 AVANT tout accès DB.
 *   - Owner-check applicatif systématique : filtre user_id (= claims.sub) ET
 *     tenant_id sur toute lecture/écriture (le service-role bypasse la RLS).
 *   - Body validé par Zod (enums entity_type/kind/status/priority + bornes), sinon 400.
 *   - Si entity_id est fourni, l'entité rattachée DOIT appartenir au même user+tenant.
 *   - IDs générés côté serveur via crypto.randomUUID().
 *   - Erreurs : log serveur, réponse générique { error: 'internal_error' } 500.
 *
 * rea_tasks est absente de database.types.ts (migration 0043 non re-typée) → on
 * accède via un client casté, comme les routes prospection voisines.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTITY_TYPES = [
  "lead",
  "property",
  "estimation",
  "mandate",
  "visit",
  "annonce",
  "match",
  "general",
] as const;
const KINDS = [
  "appel",
  "message",
  "relance",
  "rdv",
  "note",
  "validation",
  "suivi",
  "autre",
] as const;
const PRIORITIES = ["basse", "normale", "haute"] as const;
const LIST_LIMIT = 200;

/** Table → colonne d'appartenance à vérifier avant de rattacher une tâche. */
const ENTITY_TABLE: Record<string, string | null> = {
  lead: "leads",
  property: "properties",
  estimation: "estimations",
  mandate: "mandates",
  visit: "visits",
  annonce: "prosp_annonces",
  match: "prosp_matchs",
  general: null,
};

const CreateSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid().nullable().optional(),
  kind: z.enum(KINDS).default("autre"),
  title: z.string().trim().min(1).max(280),
  priority: z.enum(PRIORITIES).default("normale"),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

// database.types.ts ne connaît pas rea_tasks (migration 0043) → client casté.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Vérifie qu'une entité rattachée appartient bien à user+tenant.
 * general (ou pas d'entity_id) ⇒ rien à vérifier.
 */
async function entityBelongsToUser(
  sb: AnyClient,
  entityType: string,
  entityId: string | null | undefined,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  if (!entityId) return true;
  const table = ENTITY_TABLE[entityType];
  if (!table) return true;
  // prosp_annonces n'a pas de user_id (tenant-scopé) — on vérifie le tenant seul.
  const scopeByUser = table !== "prosp_annonces";
  let q = sb.from(table).select("id").eq("id", entityId).eq("tenant_id", tenantId);
  if (scopeByUser) q = q.eq("user_id", userId);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error("[tasks] entity ownership check failed", { code: error.code });
    return false;
  }
  return Boolean(data);
}

export async function GET(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin() as AnyClient;
  if (!sb) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const userId = claims.sub;
  const tenantId = tenantOf(claims);

  // Filtre statut optionnel (?status=open|done|snoozed). Défaut : open + snoozed.
  const statusParam = req.nextUrl.searchParams.get("status");
  const statuses =
    statusParam && ["open", "done", "snoozed"].includes(statusParam)
      ? [statusParam]
      : ["open", "snoozed"];

  const { data, error } = await sb
    .from("rea_tasks")
    .select(
      "id, entity_type, entity_id, kind, title, priority, due_at, status, snoozed_until, notes, created_at, updated_at",
    )
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .in("status", statuses)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    console.error("[tasks] list failed", { code: error.code });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin() as AnyClient;
  if (!sb) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const raw = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const userId = claims.sub;
  const tenantId = tenantOf(claims);

  const owned = await entityBelongsToUser(
    sb,
    body.entity_type,
    body.entity_id ?? null,
    userId,
    tenantId,
  );
  if (!owned) return NextResponse.json({ error: "entity_not_found" }, { status: 404 });

  const id = randomUUID();
  const { data, error } = await sb
    .from("rea_tasks")
    .insert({
      id,
      user_id: userId,
      tenant_id: tenantId,
      entity_type: body.entity_type,
      entity_id: body.entity_id ?? null,
      kind: body.kind,
      title: body.title,
      priority: body.priority,
      due_at: body.due_at ?? null,
      status: "open",
      notes: body.notes ?? null,
    })
    .select("id, entity_type, entity_id, kind, title, priority, due_at, status, snoozed_until, notes")
    .single();

  if (error || !data) {
    console.error("[tasks] create failed", { code: error?.code });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  return NextResponse.json({ task: data }, { status: 201 });
}
