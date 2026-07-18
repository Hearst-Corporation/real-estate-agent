// lib/conversion/fetch.ts — Lecture GPU1 réelle des sources du pipeline (server-only).
//
// Owner-check APPLICATIF obligatoire : le token service-role bypasse la RLS, on
// filtre donc explicitement user_id + tenant_id sur CHAQUE requête. Chaque liste
// est bornée (.limit) — aucune lecture non bornée. La fenêtre temporelle est
// appliquée sur created_at des leads (le point d'entrée du pipeline) ; les
// entités liées (estimations/visites/mandats) sont lues sur la même fenêtre.

import "server-only";
import type { getGpu1Admin } from "@/lib/gpu1";
import type { ConversionSources } from "./types";

type Db = NonNullable<ReturnType<typeof getGpu1Admin>>;

const MAX_ROWS = 5000; // borne dure par source

/**
 * Charge les 4 sources réelles pour (user, tenant) sur la fenêtre [from, to[.
 * Retourne null si l'environnement DB signale une erreur dure (traité en 500
 * neutre par la route). Une source vide n'est PAS une erreur.
 */
export async function fetchConversionSources(
  sb: Db,
  userId: string,
  tenantId: string,
  from: string,
  to: string,
): Promise<ConversionSources | null> {
  // ---- Leads (colonne de fenêtre = created_at) ----
  const leadsQ = await sb
    .from("leads")
    .select("id, status, kind, created_at, updated_at")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .gte("created_at", from)
    .lt("created_at", to)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (leadsQ.error) {
    console.error("[conversion] leads fetch failed", { code: leadsQ.error.code });
    return null;
  }

  // ---- Estimations (rattachées via owner_lead_id) ----
  const estQ = await sb
    .from("estimations")
    .select("id, status, created_at, owner_lead_id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .gte("created_at", from)
    .lt("created_at", to)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (estQ.error) {
    console.error("[conversion] estimations fetch failed", { code: estQ.error.code });
    return null;
  }

  // ---- Visites (rattachées via lead_id) ----
  const visitsQ = await sb
    .from("visits")
    .select("id, status, created_at, scheduled_at, lead_id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .gte("created_at", from)
    .lt("created_at", to)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (visitsQ.error) {
    console.error("[conversion] visits fetch failed", { code: visitsQ.error.code });
    return null;
  }

  // ---- Mandats (signaux de proposition/décision côté portefeuille) ----
  const mandatesQ = await sb
    .from("mandates")
    .select("id, status, created_at, signed_at")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .gte("created_at", from)
    .lt("created_at", to)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (mandatesQ.error) {
    console.error("[conversion] mandates fetch failed", { code: mandatesQ.error.code });
    return null;
  }

  return {
    leads: leadsQ.data ?? [],
    estimations: estQ.data ?? [],
    visits: visitsQ.data ?? [],
    mandates: mandatesQ.data ?? [],
  };
}
