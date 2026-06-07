/**
 * lib/invest/shared/idempotency.ts — Pattern A : idempotence de commande (I8).
 *
 * Toute commande mutante vers un tiers (startCase, createEscrowInstruction, mint,
 * requestSignature) prend une clé déterministe (ex. `mint:{subscriptionId}`).
 * `withIdempotency` :
 *   - INSERT ... ON CONFLICT DO NOTHING dans `inv_idempotency_keys` ;
 *   - si la clé existe déjà avec le MÊME `body_hash` → on rejoue la réponse
 *     mémorisée SANS ré-exécuter `fn` (replayed=true) ;
 *   - si la clé existe avec un `body_hash` DIFFÉRENT → `IdempotencyConflictError`
 *     (la commande ne doit JAMAIS être rejouée — pas de double acte juridique).
 *
 * Le store est INJECTABLE (interface `IdempotencyStore`) pour les tests ; un
 * adaptateur Supabase service-role par défaut est fourni, aligné sur les colonnes
 * réelles de la migration 0021 (`idem_key`, `body_hash`, `response`, `status`).
 */

import { createHash } from "node:crypto";
import { IdempotencyConflictError } from "./errors";
import { getSupabaseAdmin } from "../../server/supabase";
import { DEFAULT_TENANT_ID } from "./types";

/** Enregistrement d'idempotence tel que persisté (sous-ensemble utile). */
export interface IdempotencyRecord {
  idem_key: string;
  body_hash: string | null;
  response: unknown;
}

/**
 * Store injectable. `insert` applique ON CONFLICT DO NOTHING : il retourne
 * `true` si la ligne a bien été insérée (clé neuve), `false` si une ligne
 * existait déjà (conflit sur la clé unique `(tenant_id, idem_key)`).
 */
export interface IdempotencyStore {
  find(key: string): Promise<IdempotencyRecord | null>;
  /** @returns true si inséré (neuf), false si la clé existait déjà. */
  insert(key: string, bodyHash: string, response: unknown): Promise<boolean>;
}

export interface WithIdempotencyArgs {
  /** Clé d'idempotence déterministe (ex. `mint:{subscriptionId}`). */
  key: string;
  /** sha256 du corps de la requête (anti-collision sémantique). */
  bodyHash: string;
}

export interface WithIdempotencyResult<T> {
  /** true = réponse mémorisée rejouée (fn NON exécutée). */
  replayed: boolean;
  result: T;
}

/** sha256 stable d'un objet (JSON canonique : clés triées). PUR. */
export function hashBody(obj: unknown): string {
  return createHash("sha256").update(canonicalJson(obj)).digest("hex");
}

/** Sérialisation JSON déterministe (clés d'objet triées récursivement). */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

/**
 * Exécute `fn` sous garde d'idempotence (I8). Voir l'en-tête du module.
 *
 * @throws IdempotencyConflictError si la clé existe avec un body_hash différent.
 */
export async function withIdempotency<T>(
  store: IdempotencyStore,
  { key, bodyHash }: WithIdempotencyArgs,
  fn: () => Promise<T>,
): Promise<WithIdempotencyResult<T>> {
  // 1. INSERT ON CONFLICT DO NOTHING — la clé unique (tenant_id, idem_key) arbitre.
  //    On insère la réponse seulement après `fn` ; ici on pose d'abord un marqueur
  //    vide pour réserver la clé de façon atomique côté DB.
  const inserted = await store.insert(key, bodyHash, null);

  if (!inserted) {
    // 2. La clé existait déjà → rejeu ou conflit.
    const existing = await store.find(key);
    if (!existing) {
      // Course rarissime (ligne supprimée entre insert et find) : on retente fn.
      const result = await fn();
      return { replayed: false, result };
    }
    if (existing.body_hash != null && existing.body_hash !== bodyHash) {
      // Même clé, corps différent → JAMAIS rejouer (I8).
      throw new IdempotencyConflictError(key);
    }
    // Même clé, même corps → rejeu de la réponse mémorisée, fn NON exécutée.
    return { replayed: true, result: existing.response as T };
  }

  // 3. Clé neuve : on exécute la commande et on mémorise sa réponse.
  const result = await fn();
  await store.insert(key, bodyHash, result);
  return { replayed: false, result };
}

// ─── Adaptateur Supabase par défaut (service-role, colonnes 0021) ─────────────

/**
 * Store Supabase aligné sur `inv_idempotency_keys` (migration 0021).
 * Colonnes utilisées : `tenant_id`, `idem_key`, `body_hash`, `response`, `status`.
 * Le service-role bypass la RLS → on filtre `tenant_id` explicitement.
 *
 * @param tenantId tenant courant (défaut : `real-estate-agent`).
 */
export function supabaseIdempotencyStore(
  tenantId: string = DEFAULT_TENANT_ID,
): IdempotencyStore {
  const db = getSupabaseAdmin();
  if (!db) {
    throw new Error("[idempotency] Supabase service-role non configuré");
  }
  return {
    async find(key) {
      const { data, error } = await db
        .from("inv_idempotency_keys")
        .select("idem_key, body_hash, response")
        .eq("tenant_id", tenantId)
        .eq("idem_key", key)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        idem_key: data.idem_key,
        body_hash: data.body_hash ?? null,
        response: data.response ?? null,
      };
    },
    async insert(key, bodyHash, response) {
      // INSERT ... ON CONFLICT DO NOTHING : ignoreDuplicates ne lève pas sur la
      // contrainte unique (tenant_id, idem_key) ; on détecte le conflit via le
      // nombre de lignes renvoyées (0 = la clé existait déjà).
      const status = response === null ? "in_progress" : "succeeded";
      const { data, error } = await db
        .from("inv_idempotency_keys")
        .upsert(
          {
            tenant_id: tenantId,
            idem_key: key,
            body_hash: bodyHash,
            response: response as never,
            status,
          },
          { onConflict: "tenant_id,idem_key", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw error;
      return Array.isArray(data) && data.length > 0;
    },
  };
}
