// lib/server/supabase.ts — SHIM DE COMPATIBILITÉ (transition GPU1/PostgREST).
//
// Le SDK @supabase/supabase-js est retiré du runtime : la DB est un Postgres
// self-hosté gpu1 exposé par PostgREST. Ce fichier ne fait plus que réexporter
// le nouveau client sous l'ancien nom, le temps que les routes consommatrices
// (M02-M07) migrent leurs imports vers `@/lib/gpu1`.
//
// À SUPPRIMER une fois tous les consommateurs migrés vers `getGpu1Admin()`.
// Aucune dépendance `@supabase/*` ici — uniquement le client PostgREST natif.
import "server-only";
import { getGpu1Admin, type Gpu1Client } from "@/lib/gpu1";
import type { Database } from "@/lib/gpu1/database.types";

/**
 * @deprecated Utiliser `getGpu1Admin()` depuis `@/lib/gpu1`.
 * Client service-role serveur (bypass RLS). Toujours filtrer explicitement par
 * user_id + tenant_id côté code. NE JAMAIS exposer côté client.
 */
export function getSupabaseAdmin(): Gpu1Client<Database> | null {
  return getGpu1Admin();
}

export { getGpu1Admin } from "@/lib/gpu1";
export type { Gpu1Client, Database } from "@/lib/gpu1";
