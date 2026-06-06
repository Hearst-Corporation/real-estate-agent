/**
 * lib/invest/shared/ownership.ts — Garde d'appartenance (risque sécu n°1).
 *
 * ⚠️ Le client service-role (`getSupabaseAdmin()`) BYPASS la RLS Postgres
 * (règle CLAUDE.md : « le client service-role bypass RLS → toujours filtrer
 * `user_id` + `tenant_id` explicitement côté code »). La RLS ne nous protège
 * donc PAS dans le domaine invest : il faut asserter l'appartenance en code,
 * sur CHAQUE ligne lue/mutée, sinon un tenant peut accéder aux données d'un
 * autre (I9). Ces fonctions sont 100% PURES (aucune I/O) → testables seules,
 * et lèvent `InvariantViolationError` (jamais avalée) en cas de violation.
 */

import { InvariantViolationError } from "./errors";

/** Forme minimale d'une ligne rattachée à un tenant (toutes les tables `inv_*`). */
export interface TenantScoped {
  tenant_id: string;
}

/** Ligne rattachée à un tenant ET à un utilisateur (ressource « owner »). */
export interface UserScoped extends TenantScoped {
  user_id: string | null;
}

/** Contexte de la requête courante (issu du JWT vérifié). */
export interface OwnershipContext {
  tenantId: string;
  /** uid de l'appelant — requis seulement pour asserter l'owner. */
  userId?: string | null;
}

/**
 * Assertion d'appartenance complète (I9). Lève si la ligne n'appartient pas au
 * tenant courant et, si la ligne porte un `user_id` ET que `ctx.userId` est
 * fourni, si elle n'appartient pas à l'utilisateur courant.
 *
 * @throws InvariantViolationError (I9) si `row.tenant_id !== ctx.tenantId`
 *         ou (le cas échéant) `row.user_id !== ctx.userId`.
 * @returns la ligne, typée, pour chaînage (`const d = assertOwnership(row, ctx)`).
 */
export function assertOwnership<T extends TenantScoped & { user_id?: string | null }>(
  row: T,
  ctx: OwnershipContext,
): T {
  if (row.tenant_id !== ctx.tenantId) {
    throw new InvariantViolationError(
      "I9",
      `tenant mismatch (row=${row.tenant_id} ctx=${ctx.tenantId})`,
    );
  }
  // On ne vérifie l'owner que si la ressource est user-scopée ET qu'un userId
  // est attendu côté contexte. Les ressources partagées au tenant (user_id null)
  // ne déclenchent pas ce contrôle.
  if (ctx.userId != null && row.user_id !== undefined) {
    if (row.user_id !== ctx.userId) {
      throw new InvariantViolationError(
        "I9",
        `owner mismatch (row=${String(row.user_id)} ctx=${ctx.userId})`,
      );
    }
  }
  return row;
}

/**
 * Assertion d'appartenance au tenant uniquement, pour les ressources NON liées
 * à un utilisateur (ex. deals partagés au tenant, webhooks, jalons).
 *
 * @throws InvariantViolationError (I9) si `row.tenant_id !== tenantId`.
 * @returns la ligne, typée, pour chaînage.
 */
export function assertTenant<T extends TenantScoped>(row: T, tenantId: string): T {
  if (row.tenant_id !== tenantId) {
    throw new InvariantViolationError(
      "I9",
      `tenant mismatch (row=${row.tenant_id} ctx=${tenantId})`,
    );
  }
  return row;
}
