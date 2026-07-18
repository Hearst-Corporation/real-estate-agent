// lib/gpu1/index.ts — Usine du client PostgREST gpu1 (service-role), serveur-only.
//
// Point d'entrée unique consommé par les routes/libs métier. Remplace
// `getSupabaseAdmin()` par `getGpu1Admin()` avec une API de query aussi proche
// que possible (mêmes méthodes chaînables, même forme `{ data, error, count }`),
// pour minimiser le diff des consommateurs.
//
// Le token admin bypass RLS → le code appelant DOIT continuer à filtrer
// explicitement par user_id + tenant_id. Ce module ne relâche aucun contrôle.
import "server-only";
import type { Database } from "@/lib/gpu1/database.types";
import { Gpu1PostgrestClient } from "@/lib/gpu1/postgrest";

export type { Database } from "@/lib/gpu1/database.types";
export type {
  PostgrestError,
  PostgrestListResult,
  PostgrestSingleResult,
  PostgrestRpcResult,
  CountMode,
  FetchLike,
  TableName,
  RowOf,
} from "@/lib/gpu1/postgrest";
export { Gpu1PostgrestClient, Gpu1QueryBuilder, Gpu1SingleBuilder } from "@/lib/gpu1/postgrest";

/**
 * Alias de compatibilité de signature : les consommateurs qui typaient leurs
 * paramètres en `SupabaseClient<Database>` migrent vers ce type sans autre
 * changement de forme. `getGpu1Admin()` en renvoie une instance.
 */
export type Gpu1Client<Db = Database> = Gpu1PostgrestClient<Db>;

let _admin: Gpu1PostgrestClient<Database> | null = null;

/**
 * Client PostgREST service-role serveur (bypass RLS). Toujours filtrer
 * explicitement user_id + tenant_id côté code. NE JAMAIS exposer côté client.
 *
 * Retourne `null` si l'environnement DB n'est pas configuré — l'appelant doit
 * répondre proprement (503 / `database_not_configured`), sans révéler de
 * fournisseur ni de secret.
 */
export function getGpu1Admin(): Gpu1PostgrestClient<Database> | null {
  if (_admin) return _admin;
  const rawUrl = process.env.GPU1_POSTGREST_URL;
  const token = process.env.GPU1_POSTGREST_ADMIN_TOKEN;
  if (!rawUrl || !token) return null;
  // PostgREST expose ses tables à la racine. On tolère une base sans `/rest/v1`
  // (self-host direct) comme avec (compat proxy). On normalise sans supposer.
  const baseUrl = rawUrl.replace(/\/$/, "");
  const timeoutMs = Number.parseInt(process.env.GPU1_POSTGREST_TIMEOUT_MS ?? "", 10);
  _admin = new Gpu1PostgrestClient<Database>({
    baseUrl,
    token,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
  });
  return _admin;
}

/** Réinitialise le singleton (tests only). */
export function __resetGpu1AdminForTests(): void {
  _admin = null;
}
