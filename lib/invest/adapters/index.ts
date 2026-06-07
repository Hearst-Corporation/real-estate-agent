/**
 * lib/invest/adapters/index.ts — Registry des adaptateurs (sélection d'impl).
 *
 * Seul point où le domaine récupère une impl concrète d'un port. Les bounded
 * contexts appellent getXxxPort() (jamais l'adaptateur directement → ADR-008).
 * Au Jalon 1, ce registry pourra router selon l'env (ex. Sumsub vs Onfido).
 */

import type { KycPort } from "../ports/kyc";
import type { IdentityRegistryPort } from "../ports/identity-registry";
import type { EscrowPort } from "../ports/escrow";
import type { StablecoinPort } from "../ports/stablecoin";
import type { TokenizationPort } from "../ports/tokenization";
import type { ChainPort } from "../ports/chain";
import type { ESignaturePort } from "../ports/esignature";

import { sumsubKycAdapter, sumsubIsConfigured } from "./kyc.sumsub";
import { onchainIdAdapter, onchainIdIsConfigured } from "./identity.onchainid";
import { emiNotaireEscrowAdapter, escrowIsConfigured } from "./escrow.emi-notaire";
import { circleMoneriumAdapter, stablecoinIsConfigured } from "./stablecoin.circle-monerium";
import { tokenyAdapter, tokenyIsConfigured } from "./tokenization.tokeny";
import { chainIndexerAdapter, chainIndexerIsConfigured } from "./chain.indexer";
import { yousignAdapter, yousignIsConfigured } from "./esignature.yousign";

export function getKycPort(): KycPort {
  return sumsubKycAdapter;
}
export function getIdentityRegistryPort(): IdentityRegistryPort {
  return onchainIdAdapter;
}
export function getEscrowPort(): EscrowPort {
  return emiNotaireEscrowAdapter;
}
export function getStablecoinPort(): StablecoinPort {
  return circleMoneriumAdapter;
}
export function getTokenizationPort(): TokenizationPort {
  return tokenyAdapter;
}
export function getChainPort(): ChainPort {
  return chainIndexerAdapter;
}
export function getESignaturePort(): ESignaturePort {
  return yousignAdapter;
}

/** Statut de configuration runtime de chaque adaptateur (pattern providersStatus). */
export function investAdaptersStatus(): Record<string, boolean> {
  return {
    kyc_sumsub: sumsubIsConfigured(),
    identity_onchainid: onchainIdIsConfigured(),
    escrow_emi_notaire: escrowIsConfigured(),
    stablecoin_casp: stablecoinIsConfigured(),
    tokenization_tokeny: tokenyIsConfigured(),
    chain_indexer: chainIndexerIsConfigured(),
    esignature_yousign: yousignIsConfigured(),
  };
}
