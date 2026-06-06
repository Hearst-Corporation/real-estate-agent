/**
 * lib/invest/shared/domain-events.ts — Événements de domaine (bus Inngest).
 *
 * Les bounded contexts communiquent UNIQUEMENT par événements (jamais d'accès
 * direct aux tables d'un autre contexte — ADR-004). Cette union typée est le
 * contrat partagé. Chemin Subscription→Settlement→Ledger→Token : cf. §2.3.
 *
 * Convention de nommage : `invest/<sujet>.<participe>` (cf. §6.2).
 */

import type { TenantId, Eur, IdempotencyKey } from "./types";

/** Enveloppe commune : tout event porte tenant + corrélation + horodatage. */
interface EventBase {
  tenantId: TenantId;
  /** Id de corrélation (souvent dealId ou subscriptionId) pour le tracing. */
  correlationId: string;
  occurredAt: string; // ISO-8601
}

/** ③ Soft-commit créé (acte explicite investisseur, AUCUN fonds — I2/I3). */
export interface SubscriptionCommittedEvent extends EventBase {
  name: "invest/subscription.committed";
  data: { subscriptionId: string; dealId: string; userId: string; amountEur: Eur };
}

/** ③ Bulletin + contrat d'émission signés (eIDAS). */
export interface SubscriptionSignedEvent extends EventBase {
  name: "invest/subscription.signed";
  data: { subscriptionId: string; dealId: string; envelopeId: string };
}

/** ⑤ Fonds reçus et bloqués en séquestre tiers par-deal (I4). */
export interface FundsEscrowedEvent extends EventBase {
  name: "invest/funds.escrowed";
  data: { subscriptionId: string; dealId: string; rail: string; amountEur: Eur };
}

/** ⑤ Objectif de levée atteint → déclenche la saga de closing (ADR-005). */
export interface DealFundedEvent extends EventBase {
  name: "invest/deal.funded";
  data: { dealId: string; raisedEur: Eur; targetEur: Eur };
}

/** ⑤+④+⑥ Closing réussi : DEEP inscrit + miroir minté + réconcilié. */
export interface DealClosedEvent extends EventBase {
  name: "invest/deal.closed";
  data: { dealId: string };
}

/** ⑤ Conditions suspensives non remplies → remboursement intégral (I4). */
export interface DealCancelledEvent extends EventBase {
  name: "invest/deal.cancelled";
  data: { dealId: string; reason: string };
}

/** ⑦ Événement d'exit → calcul waterfall puis payouts (inv-distribution-run). */
export interface DealExitEvent extends EventBase {
  name: "invest/deal.exit";
  data: { dealId: string };
}

/** ⑥ Event on-chain indexé (Transfer/Mint) → réconciliation DEEP↔chaîne. */
export interface ChainEvent extends EventBase {
  name: "invest/chain.event";
  data: { contractAddress: string; txHash: string; logIndex: number; eventName: string };
}

/** ① KYC incomplet → relance différée (inv-kyc-followup). */
export interface KycPendingEvent extends EventBase {
  name: "invest/kyc.pending";
  data: { userId: string; kycCaseId: string };
}

/** Pattern C : échec définitif d'une opération vers un tiers → DLQ + alerte. */
export interface OpFailedEvent extends EventBase {
  name: "invest/op.failed";
  data: { opKind: string; idempotencyKey: IdempotencyKey; lastError: string };
}

/** Union de TOUS les événements de domaine du contexte invest. */
export type InvestDomainEvent =
  | SubscriptionCommittedEvent
  | SubscriptionSignedEvent
  | FundsEscrowedEvent
  | DealFundedEvent
  | DealClosedEvent
  | DealCancelledEvent
  | DealExitEvent
  | ChainEvent
  | KycPendingEvent
  | OpFailedEvent;

/** Nom (discriminant) de tout event de domaine invest. */
export type InvestEventName = InvestDomainEvent["name"];

/** Liste exhaustive des noms d'events (déclaration Inngest, validation). */
export const INVEST_EVENT_NAMES = [
  "invest/subscription.committed",
  "invest/subscription.signed",
  "invest/funds.escrowed",
  "invest/deal.funded",
  "invest/deal.closed",
  "invest/deal.cancelled",
  "invest/deal.exit",
  "invest/chain.event",
  "invest/kyc.pending",
  "invest/op.failed",
] as const satisfies readonly InvestEventName[];

/**
 * Helper de nommage typé : construit le nom d'event à partir d'un sujet + état.
 * Garantit la convention `invest/<sujet>.<participe>` au compile-time.
 */
export function eventName(subject: string, participle: string): InvestEventName {
  const name = `invest/${subject}.${participle}`;
  if (!(INVEST_EVENT_NAMES as readonly string[]).includes(name)) {
    throw new Error(`Event de domaine inconnu : ${name}`);
  }
  return name as InvestEventName;
}
