import "server-only";
import type { Gpu1Client } from "@/lib/gpu1";
import { getGpu1Admin } from "@/lib/gpu1";

/**
 * Accès DB à la table `user_mfa` — FAIL-SOFT TOTAL.
 *
 * GARANTIE ANTI-LOCKOUT : tant que la migration 0035 n'est pas appliquée (table absente),
 * ou sur toute autre erreur (réseau, Supabase non configuré, colonne manquante…), ces
 * fonctions se comportent comme « pas de MFA » :
 *   - lecture  → `null`  (jamais de throw)
 *   - écriture → `false` (jamais de throw)
 * Aucun utilisateur ne peut donc être verrouillé par un état DB indisponible.
 *
 * La table `user_mfa` n'est PAS dans les types générés (au même titre que `revoked_sessions`)
 * tant que 0035 n'est pas appliquée → on cast le client en `Gpu1Client` non typé
 * (cf. lib/server/auth.ts lignes 70-78 pour le même pattern).
 */

/** Forme d'une ligne `user_mfa` côté serveur (clair pour le secret, hashes pour les codes). */
export type UserMfa = {
  secret: string;
  enabled: boolean;
  backup_codes: string[];
};

/** Client service-role non typé (table hors types générés). `null` si Supabase non configuré. */
function untypedAdmin(): Gpu1Client<unknown> | null {
  return getGpu1Admin() as Gpu1Client<unknown> | null;
}

/**
 * Lit la ligne MFA d'un utilisateur.
 * @returns la ligne `{ secret, enabled, backup_codes }`, ou `null` si aucune ligne /
 *          TOUTE erreur (table absente, réseau, Supabase non configuré). JAMAIS de throw.
 */
export async function getUserMfa(userId: string): Promise<UserMfa | null> {
  if (!userId) return null;
  const sb = untypedAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("user_mfa")
      .select("secret, enabled, backup_codes")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      secret: typeof data.secret === "string" ? data.secret : "",
      enabled: Boolean(data.enabled),
      backup_codes: Array.isArray(data.backup_codes) ? (data.backup_codes as string[]) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Enregistre un secret TOTP « en attente » (upsert sur `user_id`).
 * NE touche PAS `enabled` (préserve l'état si une ligne existe déjà — un re-setup ne désactive
 * pas un MFA actif). `confirmed_at` n'est posé qu'à l'activation effective (enableMfa).
 * @returns `true` si l'upsert a réussi, `false` sur toute erreur.
 */
export async function savePendingSecret(userId: string, secret: string): Promise<boolean> {
  if (!userId || !secret) return false;
  const sb = untypedAdmin();
  if (!sb) return false;
  try {
    const { error } = await sb
      .from("user_mfa")
      .upsert({ user_id: userId, secret }, { onConflict: "user_id" });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Active le MFA : `enabled=true`, `confirmed_at=now()`, et persiste les HASHES des codes de secours.
 * @param backupHashes hashes sha256 (jamais le clair) issus de `hashBackupCode`.
 * @returns `true` si l'update a réussi, `false` sur toute erreur.
 */
export async function enableMfa(userId: string, backupHashes: string[]): Promise<boolean> {
  if (!userId) return false;
  const sb = untypedAdmin();
  if (!sb) return false;
  try {
    const { error } = await sb
      .from("user_mfa")
      .update({
        enabled: true,
        confirmed_at: new Date().toISOString(),
        backup_codes: Array.isArray(backupHashes) ? backupHashes : [],
      })
      .eq("user_id", userId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Désactive le MFA : `enabled=false`, purge du secret et des codes de secours.
 * @returns `true` si l'update a réussi, `false` sur toute erreur.
 */
export async function disableMfa(userId: string): Promise<boolean> {
  if (!userId) return false;
  const sb = untypedAdmin();
  if (!sb) return false;
  try {
    const { error } = await sb
      .from("user_mfa")
      .update({ enabled: false, secret: "", backup_codes: [] })
      .eq("user_id", userId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Met à jour la liste des HASHES de codes de secours restants
 * (consommation d'un code de secours, ex. au login).
 * @returns `true` si l'update a réussi, `false` sur toute erreur.
 */
export async function updateBackupCodes(userId: string, remaining: string[]): Promise<boolean> {
  if (!userId) return false;
  const sb = untypedAdmin();
  if (!sb) return false;
  try {
    const { error } = await sb
      .from("user_mfa")
      .update({ backup_codes: Array.isArray(remaining) ? remaining : [] })
      .eq("user_id", userId);
    return !error;
  } catch {
    return false;
  }
}
