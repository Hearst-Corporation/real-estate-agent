/**
 * GET /api/admin/audit-log — lecture du journal d'audit (admin only).
 *
 * Gating STRICT identique à app/api/admin/mfa-reset/route.ts :
 *   - 401 non authentifié (pas de claims)
 *   - 403 si claims.role !== "admin"
 *
 * ISOLATION MULTI-TENANT (fail-closed) : `auth_audit_log` contient des données forensiques
 * sensibles (IP, email en clair dans meta). Le service-role bypass la RLS → sans borne, un
 * admin lirait les logs de TOUS les tenants. On borne donc TOUJOURS au tenant courant :
 *   - user_id fourni  → 403 s'il n'appartient pas au tenant de l'admin (isSameTenant) ;
 *   - user_id absent  → on restreint aux user_id du tenant courant (listTenantUserIds + .in()).
 * Conséquence assumée : les événements à user_id NULL (ex. login_failed sur email inexistant)
 * ne sont jamais renvoyés ici — c'est volontaire (leur meta peut contenir un email d'un autre
 * tenant). Tenant sans aucun user connu / DB indisponible → rows: [] (on ne fuite rien).
 *
 * Query params :
 *   limit    — défaut 50, borné à MAX_LIMIT (200) via Math.min ; toujours >= 1.
 *   offset   — défaut 0, toujours >= 0.
 *   event    — filtre optionnel sur le type d'événement (string brut, ex: "login_failed").
 *   user_id  — filtre optionnel sur l'UUID utilisateur ; rejeté avec 400 si format invalide,
 *              403 si hors du tenant courant.
 *
 * Réponse succès  : { rows: AuditRow[], limit: number, offset: number }
 * Fail-soft DB    : { rows: [], limit: number, offset: number } — jamais 500 sur lecture forensique.
 *
 * La table `auth_audit_log` n'est pas dans les types générés (même situation que `user_mfa`
 * dans lib/server/mfa-store.ts) → cast Gpu1Client non typé.
 */

import { NextResponse } from "next/server";
import type { Gpu1Client } from "@/lib/gpu1";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { isSameTenant, listTenantUserIds } from "@/lib/server/auth-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pagination : limite max acceptée en query param. */
const MAX_LIMIT = 200;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Client service-role non typé (table hors types générés). `null` si DB non configurée. */
function untypedAdmin(): Gpu1Client<unknown> | null {
  return getGpu1Admin() as Gpu1Client<unknown> | null;
}

export async function GET(req: Request) {
  // — Auth : 401 si pas de session ——————————————————————————————————————
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // — Gating admin STRICT : 403 si role !== "admin" ————————————————————
  if (claims.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // — Parsing & validation des query params ————————————————————————————
  const { searchParams } = new URL(req.url);

  const rawLimit = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), MAX_LIMIT);

  const rawOffset = parseInt(searchParams.get("offset") ?? "0", 10);
  const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

  const event = searchParams.get("event") ?? undefined;

  const rawUserId = searchParams.get("user_id");
  if (rawUserId !== null && !UUID_RE.test(rawUserId)) {
    return NextResponse.json({ error: "invalid_user_id" }, { status: 400 });
  }
  const userId = rawUserId ?? undefined;

  // — Isolation multi-tenant (fail-closed) ————————————————————————————————
  // Cas 1 : user_id explicite → il DOIT appartenir au tenant courant, sinon 403.
  if (userId !== undefined) {
    const sameTenant = await isSameTenant(claims.tenant_id, userId);
    if (!sameTenant) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Cas 2 : pas de user_id → on borne la lecture aux user_id du tenant courant.
  // Tenant sans user connu → liste vide → on ne renvoie RIEN (jamais de fuite cross-tenant).
  let tenantUserIds: string[] | null = null;
  if (userId === undefined) {
    tenantUserIds = await listTenantUserIds(claims.tenant_id);
    if (tenantUserIds.length === 0) {
      return NextResponse.json({ rows: [], limit, offset });
    }
  }

  // — Requête DB via cast non typé ——————————————————————————————————————
  const sb = untypedAdmin();
  if (!sb) {
    // Base GPU1 non configurée → fail-soft
    return NextResponse.json({ rows: [], limit, offset });
  }

  try {
    let query = sb
      .from("auth_audit_log")
      .select("id,user_id,event,ip,user_agent,meta,created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (event !== undefined) {
      query = query.eq("event", event);
    }
    if (userId !== undefined) {
      // Déjà prouvé dans le tenant courant ci-dessus.
      query = query.eq("user_id", userId);
    } else if (tenantUserIds) {
      // Borne dure : uniquement les événements des users du tenant courant.
      query = query.in("user_id", tenantUserIds);
    }

    const { data, error } = await query;

    if (error || !data) {
      // Erreur DB ou table absente → fail-soft, jamais 500 sur lecture forensique
      return NextResponse.json({ rows: [], limit, offset });
    }

    return NextResponse.json({ rows: data, limit, offset });
  } catch {
    // Fail-soft total : jamais de 500 sur ce endpoint de lecture
    return NextResponse.json({ rows: [], limit, offset });
  }
}
