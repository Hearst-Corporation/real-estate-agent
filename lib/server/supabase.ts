import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

let _admin: SupabaseClient<Database> | null = null;

/**
 * Client service-role serveur. Bypass RLS — toujours filtrer explicitement
 * par user_id + tenant_id côté code. NE JAMAIS exposer côté client.
 */
export function getSupabaseAdmin(): SupabaseClient<Database> | null {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
