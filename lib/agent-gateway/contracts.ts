/**
 * lib/agent-gateway/contracts.ts — champs communs à TOUTES les interfaces
 * (§2 de tool-gateway.md) : statut de vérité, tenant/utilisateur obligatoires,
 * schéma d'entrée strict.
 */
import "server-only";
import { z } from "zod";

/** §4 du contrat — jamais null, jamais objet vide. */
export const TruthStatus = z.enum(["AVAILABLE", "UNAVAILABLE", "DENIED", "TIMEOUT"]);
export type TruthStatusT = z.infer<typeof TruthStatus>;

/**
 * Délégation d'acteur signée (HMAC) — permet à un acteur non présent dans `users`
 * (job autonome) d'agir SI et seulement si une délégation explicite le couvre.
 * Facultative ; validée par lib/agent-gateway/delegation.ts, fail-closed.
 */
export const DelegationSchema = z.object({
  actor_user_id: z.string().trim().min(1).max(200),
  tenant_id: z.string().trim().min(1).max(200),
  agent_id: z.string().trim().min(1).max(200),
  expires_at: z.string().datetime({ offset: true }).or(z.string().datetime()),
  signature: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/i), // HMAC-SHA256 hex
});

/**
 * Enveloppe commune à TOUTE entrée gateway : tenant + acteur (utilisateur au
 * nom duquel l'agent agit) obligatoires. `agent_id` est déclaré facultatif ICI
 * (schéma) mais RENDU OBLIGATOIRE par l'autorisation (lib/agent-gateway/authz.ts)
 * afin de refuser un agent manquant avec un DENIED audité plutôt qu'un 400 muet.
 * Le tenant/acteur du payload ne sont JAMAIS de confiance : ils sont revérifiés
 * contre la config du token + la base par authz (frontière de confiance).
 * Chaque route étend ce schéma avec ses propres champs métier via `.extend()`.
 */
export const GatewayEnvelopeSchema = z.object({
  tenant_id: z.string().trim().min(1).max(200),
  actor_user_id: z.string().trim().min(1).max(200), // uuid utilisateur (ou sujet délégué)
  agent_id: z.string().trim().min(1).max(200).optional(), // identifiant agent Aigent appelant
  delegation: DelegationSchema.optional(), // délégation signée facultative (acteur non-users)
});
export type GatewayEnvelope = z.infer<typeof GatewayEnvelopeSchema>;

/** Clé d'idempotence — requise sur toute interface d'écriture (§2). */
export const IdempotencyKeySchema = z.string().trim().min(8).max(200);
