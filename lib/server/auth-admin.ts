import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/supabase";

/**
 * lib/server/auth-admin.ts — isolation multi-tenant des actions d'administration.
 *
 * Le client service-role bypass la RLS : un `role === "admin"` seul ne suffit donc
 * PAS à autoriser une action ciblant un autre utilisateur — sans borne de tenant, un
 * admin du tenant A pourrait reset / lister / révoquer un compte du tenant B. Ce module
 * fournit la borne manquante : il résout le tenant du user CIBLE (depuis la source de
 * vérité `auth_credentials`, migration 0037) et le compare au tenant de l'acteur.
 *
 * FAIL-CLOSED : contrairement aux stores best-effort (mfa-store, audit-log), l'isolation
 * de sécurité ne tolère PAS le fail-open. Toute impossibilité de PROUVER l'appartenance
 * au même tenant (Supabase non configuré, user cible introuvable, erreur DB) renvoie
 * `false` → l'appelant DOIT refuser (403). Ne jamais transformer un doute en autorisation.
 *
 * `auth_credentials` n'est pas dans les types générés (même situation que `user_mfa` /
 * `revoked_sessions`) → cast SupabaseClient non typé pour cette requête.
 */

/** Client service-role non typé (table hors types générés). `null` si Supabase non configuré. */
function untypedAdmin(): SupabaseClient | null {
  return getSupabaseAdmin() as SupabaseClient | null;
}

/**
 * Résout le tenant d'un utilisateur depuis `auth_credentials` (source de vérité du tenant, 0037).
 * @returns le `tenant_id` du user, ou `null` s'il est introuvable / sur toute erreur DB.
 *          JAMAIS de throw. Un `null` doit être traité par l'appelant comme « non prouvé ».
 */
export async function getUserTenant(userId: string): Promise<string | null> {
  if (!userId) return null;
  const sb = untypedAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("auth_credentials")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return typeof data.tenant_id === "string" ? data.tenant_id : null;
  } catch {
    return null;
  }
}

/**
 * Liste les `user_id` d'un tenant donné (depuis `auth_credentials`). Sert à borner les
 * lectures d'administration (audit-log) au périmètre du tenant courant.
 * @param limit borne dure sur la taille du résultat (défaut 5000) — aucune liste sans LIMIT.
 * @returns un tableau d'UUID (éventuellement vide), JAMAIS de throw. Sur erreur DB → `[]`
 *          (fail-closed : mieux vaut ne rien montrer que fuiter au-delà du tenant).
 */
export async function listTenantUserIds(tenantId: string, limit = 5000): Promise<string[]> {
  if (!tenantId) return [];
  const sb = untypedAdmin();
  if (!sb) return [];
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 5000;
  try {
    const { data, error } = await sb
      .from("auth_credentials")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .limit(safeLimit);
    if (error || !Array.isArray(data)) return [];
    return data
      .map((r) => (typeof r.user_id === "string" ? r.user_id : null))
      .filter((v): v is string => v !== null);
  } catch {
    return [];
  }
}

/**
 * Vérifie qu'un utilisateur cible appartient AU MÊME tenant qu'un acteur admin.
 *
 * FAIL-CLOSED : renvoie `true` UNIQUEMENT si le tenant du user cible est résolu ET
 * strictement égal à `actorTenantId`. Tout le reste (user introuvable, DB indisponible,
 * tenants différents) → `false`. L'appelant refuse alors avec 403.
 *
 * @param actorTenantId tenant de l'acteur (issu du JWT vérifié — jamais du body).
 * @param targetUserId  utilisateur ciblé par l'action d'administration.
 */
export async function isSameTenant(actorTenantId: string, targetUserId: string): Promise<boolean> {
  if (!actorTenantId || !targetUserId) return false;
  const targetTenant = await getUserTenant(targetUserId);
  if (!targetTenant) return false; // non prouvé → refus
  return targetTenant === actorTenantId;
}
