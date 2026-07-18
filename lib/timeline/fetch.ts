// lib/timeline/fetch.ts — Lecture GPU1 réelle des sources d'une entité (server-only).
//
// Owner-check APPLICATIF obligatoire : le token service-role bypasse la RLS, on
// filtre donc explicitement user_id + tenant_id sur CHAQUE requête. L'entité
// racine (lead ou bien) est d'abord vérifiée appartenir au couple (user, tenant)
// avant toute agrégation ; sinon on renvoie null (traité en 404 par la route).

import "server-only";
import type { getGpu1Admin } from "@/lib/gpu1";
import { buildTimeline } from "./aggregate";
import type { TimelineEntity, TimelineEvent, TimelineSources } from "./types";

type Db = NonNullable<ReturnType<typeof getGpu1Admin>>;

/** Vérifie que l'entité racine appartient bien à (user, tenant). */
async function assertOwnership(
  sb: Db,
  entity: TimelineEntity,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const table = entity.type === "lead" ? "leads" : "properties";
  const { data, error } = await sb
    .from(table)
    .select("id")
    .eq("id", entity.id)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    console.error("[timeline] ownership check failed", { code: error.code });
    return false;
  }
  return Boolean(data);
}

/**
 * Charge les sources brutes puis retourne le flux agrégé. Retourne null si
 * l'entité n'appartient pas à (user, tenant) — l'appelant répond 404.
 *
 * Toutes les requêtes filtrent user_id + tenant_id. Chaque `.limit()` borne la
 * lecture (aucune liste non bornée).
 */
export async function fetchTimeline(
  sb: Db,
  entity: TimelineEntity,
  userId: string,
  tenantId: string,
  limit = 100,
): Promise<TimelineEvent[] | null> {
  const owns = await assertOwnership(sb, entity, userId, tenantId);
  if (!owns) return null;

  const PER_SOURCE = 100;
  const sources: TimelineSources = {};

  // ---- Visites (leads ET biens) ----
  {
    const q = sb
      .from("visits")
      .select("id, scheduled_at, created_at, status, duration_min, feedback, notes, property_id, lead_id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq(entity.type === "lead" ? "lead_id" : "property_id", entity.id)
      .order("scheduled_at", { ascending: false })
      .limit(PER_SOURCE);
    const { data, error } = await q;
    if (error) console.error("[timeline] visits fetch failed", { code: error.code });
    else sources.visits = data ?? [];
  }

  // ---- Estimations (leads via owner_lead_id, biens via property_id) ----
  {
    const q = sb
      .from("estimations")
      .select("id, created_at, valued_at, updated_at, status, city, market_value, recommended_price, property_id, owner_lead_id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq(entity.type === "lead" ? "owner_lead_id" : "property_id", entity.id)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE);
    const { data, error } = await q;
    if (error) {
      console.error("[timeline] estimations fetch failed", { code: error.code });
    } else {
      sources.estimations = data ?? [];
      // ---- Messages d'estimation rattachés à ces estimations ----
      const estIds = (data ?? []).map((e: { id: string }) => e.id);
      if (estIds.length) {
        const { data: msgs, error: mErr } = await sb
          .from("estimation_messages")
          .select("id, created_at, role, content, estimation_id")
          .eq("tenant_id", tenantId)
          .in("estimation_id", estIds)
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE);
        if (mErr) console.error("[timeline] estimation_messages fetch failed", { code: mErr.code });
        else sources.estimationMessages = msgs ?? [];
      }
    }
  }

  // ---- Mandats (biens uniquement — table mandates rattachée à property_id) ----
  if (entity.type === "property") {
    const { data, error } = await sb
      .from("mandates")
      .select("id, created_at, signed_at, status, kind, reference, asking_price, property_id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("property_id", entity.id)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE);
    if (error) console.error("[timeline] mandates fetch failed", { code: error.code });
    else sources.mandates = data ?? [];
  }

  // ---- Tentatives de contact prospection (leads uniquement — lead_id) ----
  if (entity.type === "lead") {
    const { data, error } = await sb
      .from("prosp_contact_attempts")
      .select("id, created_at, sent_at, canal, statut, provider, error, lead_id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("lead_id", entity.id)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE);
    if (error) console.error("[timeline] contact_attempts fetch failed", { code: error.code });
    else sources.contactAttempts = data ?? [];
  }

  return buildTimeline(sources, limit);
}
