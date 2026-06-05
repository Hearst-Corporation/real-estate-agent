import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Charge une estimation appartenant à userId+tenant.
 * Seule barrière d'isolation (RLS dormante car service-role) — utilisée par
 * toutes les routes [id].
 */
export async function loadOwnedEstimation(
  sb: SupabaseClient<Database>,
  id: string,
  userId: string,
  tenant: string
) {
  const { data, error } = await sb
    .from("estimations")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .maybeSingle();

  if (error) throw error;
  return data; // null si non trouvé
}
