/**
 * lib/admin/overview.ts — Données de la page admin (lecture seule).
 *
 * Vue d'oversight : statut des providers + volumétrie globale. Réservé au role
 * admin (la garde est côté caller : page + route /api/admin).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { providersStatus } from "@/lib/providers";

export interface AdminOverview {
  providers: Record<string, boolean>;
  counts: { estimations: number; leads: number; leadsEnriched: number };
}

export async function buildAdminOverview(
  sb: SupabaseClient<Database> | null,
  tenantId: string,
): Promise<AdminOverview> {
  const providers = providersStatus();
  let counts = { estimations: 0, leads: 0, leadsEnriched: 0 };

  if (sb) {
    // Compteurs bornés au tenant courant (isolation multi-tenant — REA-M04-01).
    const [est, leads, enriched] = await Promise.all([
      sb.from("estimations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      sb.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      sb.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).not("enriched_at", "is", null),
    ]);
    counts = {
      estimations: est.count ?? 0,
      leads: leads.count ?? 0,
      leadsEnriched: enriched.count ?? 0,
    };
  }

  return { providers, counts };
}
