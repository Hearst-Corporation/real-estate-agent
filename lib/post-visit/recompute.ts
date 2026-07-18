/**
 * lib/post-visit/recompute.ts — RECALCUL des matchs après visite avec le moteur
 * EXISTANT. On NE réinvente AUCUN score : on recharge le bien visité + les
 * critères acquéreurs actifs du tenant et on délègue à
 * `matchPropertyToAcquereurs` (lib/offmarket → lib/prospection/matchAnnonce).
 *
 * Sécurité : client service-role (bypass RLS) → owner-check `user_id + tenant_id`
 * explicite sur CHAQUE lecture. Dégrade en UNAVAILABLE si une table manque.
 */

import "server-only";
import type { Gpu1Client } from "@/lib/gpu1";
import {
  matchPropertyToAcquereurs,
  type OffmarketMatch,
  type PropertyRow,
} from "@/lib/offmarket/matching";
import { isPostVisitTableMissing } from "./types";

export type RecomputeOutcome =
  | { ok: true; matches: OffmarketMatch[]; propertyId: string }
  | { ok: false; reason: "unavailable" | "not_found" | "error" };

/** Colonnes du bien nécessaires à l'adaptation `propertyToAnnonce`. */
const PROPERTY_COLUMNS =
  "id, tenant_id, property_type, title, notes, asking_price, surface, rooms, " +
  "bedrooms, postal_code, city, has_elevator, has_terrace, has_parking, " +
  "has_garden, has_pool, dpe_letter";

/**
 * Recalcule les matchs acquéreurs pour le bien d'une visite donnée.
 * `propertyId` provient de la visite déjà owner-checkée par l'appelant.
 */
export async function recomputeMatchesForProperty(
  sb: Gpu1Client,
  propertyId: string,
  userId: string,
  tenantId: string,
): Promise<RecomputeOutcome> {
  // 1. Bien du portefeuille, owner-scopé (le service-role bypasse la RLS).
  const { data: property, error: pErr } = await sb
    .from("properties")
    .select(PROPERTY_COLUMNS)
    .eq("id", propertyId)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (pErr) {
    if (isPostVisitTableMissing(pErr.code)) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "error" };
  }
  if (!property) return { ok: false, reason: "not_found" };

  // 2. Critères acquéreurs ACTIFS du tenant (owner-scopé user + tenant).
  const { data: criteres, error: cErr } = await sb
    .from("prosp_criteres_acquereur")
    .select("*")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("actif", true)
    .limit(500);

  if (cErr) {
    if (isPostVisitTableMissing(cErr.code)) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "error" };
  }

  // 3. Délégation INTÉGRALE au moteur existant — aucun score fabriqué ici.
  const matches = matchPropertyToAcquereurs(
    property as unknown as PropertyRow,
    (criteres ?? []) as Array<Record<string, unknown>>,
  );

  return { ok: true, matches, propertyId };
}
