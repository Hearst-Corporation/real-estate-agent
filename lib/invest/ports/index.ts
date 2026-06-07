/**
 * lib/invest/ports/index.ts — Barrel des 7 ports du domaine invest.
 *
 * Le domaine ne dépend QUE de ces interfaces (ADR-008 : adaptateurs
 * interchangeables). Les adaptateurs concrets vivent dans ../adapters/* et ne
 * sont jamais importés par un bounded context.
 */

export type { KycPort, KycLevel, KycStatus, KycDomainEvent } from "./kyc";
export type { IdentityRegistryPort, EvmAddress } from "./identity-registry";
export type { EscrowPort, EscrowProvider, EscrowAccountRef } from "./escrow";
export type { StablecoinPort, StablecoinAsset, CaspProvider, TravelRuleInfo } from "./stablecoin";
export {
  ALLOWED_STABLECOIN_ASSETS,
  isAllowedStablecoinAsset,
} from "./stablecoin";
export type { TokenizationPort, TokenStandard, TokenOpResult } from "./tokenization";
export {
  ALLOWED_TOKEN_STANDARDS,
  isAllowedTokenStandard,
} from "./tokenization";
export type { ChainPort, IndexedChainEvent } from "./chain";
export type {
  ESignaturePort,
  ESignDocKind,
  ESignLevel,
  ESignState,
  ESignDomainEvent,
} from "./esignature";
