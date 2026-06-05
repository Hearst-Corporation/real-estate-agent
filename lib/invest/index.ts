/**
 * lib/invest/index.ts — Barrel du domaine d'investissement immobilier tokenisé.
 *
 * Epic 0.2 — squelette des 9 bounded contexts + 7 ports/adaptateurs + moteur
 * financier porté. Architecture : docs/produit/04-architecture-technique.md.
 *
 * Les contextes sont exposés en NAMESPACES pour éviter les collisions de noms de
 * types entre contextes (ex. EscrowProvider, ReconciliationStatus, Holding…) :
 *   import { investSubscription } from "@/lib/invest";
 *   investSubscription.transition(state, event);
 */

// Socle partagé (erreurs, types transverses, events de domaine).
export * from "./shared/errors";
export * from "./shared/types";
export * from "./shared/domain-events";

// Ports (interfaces) + registry d'adaptateurs.
export * as investPorts from "./ports";
export {
  getKycPort,
  getIdentityRegistryPort,
  getEscrowPort,
  getStablecoinPort,
  getTokenizationPort,
  getChainPort,
  getESignaturePort,
  investAdaptersStatus,
} from "./adapters";

// Les 9 bounded contexts (namespaces).
export * as investInvestor from "./investor";
export * as investDeal from "./deal";
export * as investSubscription from "./subscription";
export * as investLedger from "./ledger";
export * as investSettlement from "./settlement";
export * as investTokenization from "./tokenization";
export * as investDistribution from "./distribution";
export * as investCompliance from "./compliance";
export * as investSecondary from "./secondary";

// Moteur financier pur (porté tel quel — ne pas réimplémenter).
export * as investFinance from "./finance";

import { investAdaptersStatus } from "./adapters";

/**
 * Statut runtime du domaine invest : configuration de chaque adaptateur externe
 * (même pattern que providersStatus()). Tout false au lancement (vars absentes).
 * Branché sur /api/health ou un futur /api/invest/status au Jalon 1.
 */
export function investStatus(): Record<string, boolean> {
  return investAdaptersStatus();
}
