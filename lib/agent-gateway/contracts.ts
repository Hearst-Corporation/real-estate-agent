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
 * Enveloppe commune à TOUTE entrée gateway : tenant + acteur (utilisateur au
 * nom duquel l'agent agit, ou "system" pour un job autonome) obligatoires.
 * Chaque route étend ce schéma avec ses propres champs métier via `.extend()`.
 */
export const GatewayEnvelopeSchema = z.object({
  tenant_id: z.string().trim().min(1).max(200),
  actor_user_id: z.string().trim().min(1).max(200), // uuid utilisateur ou "system"
  agent_id: z.string().trim().min(1).max(200).optional(), // identifiant agent Aigent appelant
});
export type GatewayEnvelope = z.infer<typeof GatewayEnvelopeSchema>;

/** Clé d'idempotence — requise sur toute interface d'écriture (§2). */
export const IdempotencyKeySchema = z.string().trim().min(8).max(200);
