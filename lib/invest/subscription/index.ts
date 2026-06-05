/**
 * lib/invest/subscription/index.ts — ③ Subscription & Order : services + machine à états.
 *
 * Logique PURE implémentée : transition(state, event) avec gardes anti-FIA.
 * Les opérations DB / appels ports (eIDAS, escrow) sont des stubs (Jalon 1).
 *
 * INVARIANTS matérialisés dans la machine à états :
 *  - I2 : aucun fonds ne bouge sans une souscription rattachée à un deal ;
 *         `fund` n'est PAS un dépôt de solde — il exige un état `signed`.
 *  - I3 : la souscription est un acte EXPLICITE (créée par l'investisseur, jamais
 *         par un job) ; `sign` est requis avant tout versement.
 *  - I4 : les fonds vont en séquestre tiers (transition funded), jamais en propre.
 *  - I1 : `allocate` (closing) précède `mint` (le miroir suit le DEEP).
 */

import { NotImplementedError, InvariantViolationError } from "../shared/errors";
import type { Result } from "../shared/types";
import { ok, err } from "../shared/types";
import { getSupabaseAdmin } from "../../server/supabase";
import type {
  Subscription,
  SubscriptionStatus,
  SubscriptionEvent,
  SettlementCurrency,
} from "./types";

export * from "./types";

/** Rails de règlement WHITELISTÉS (I6) — exclut USDT. */
const ALLOWED_RAILS: readonly SettlementCurrency[] = ["EUR", "EURC", "EURe"];

/**
 * Table de transitions autorisées (statut courant → événement → statut cible).
 * Tout couple absent de la table est REFUSÉ (anti-FIA par construction).
 */
const TRANSITIONS: Record<SubscriptionStatus, Partial<Record<SubscriptionEvent["type"], SubscriptionStatus>>> = {
  reserved: {
    sign: "signed", // I3 — acte explicite obligatoire avant fonds
    cancel: "cancelled", // annulation avant tout versement
  },
  signed: {
    fund: "funded", // I2/I4 — versement vers séquestre, jamais un solde
    withdraw: "withdrawn", // I — rétractation 4j ECSP (sans pénalité)
    cancel: "cancelled",
  },
  funded: {
    allocate: "allocated", // closing : conditions suspensives remplies
    refund: "refunded", // échec levée / annulation deal → remboursement intégral
  },
  allocated: {
    mint: "minted", // I1 — miroir on-chain APRÈS inscription DEEP
    refund: "refunded", // compensation saga (rare)
  },
  // États terminaux : aucune transition sortante.
  minted: {},
  refunded: {},
  cancelled: {},
  withdrawn: {},
};

/**
 * Machine à états PURE de la souscription.
 *
 * @returns Result : ok(nouveauStatut) si la transition est permise, sinon err(motif).
 *          Ne lève PAS pour une transition refusée (cas métier attendu) ; lève
 *          InvariantViolationError uniquement si un event tente de violer un
 *          invariant dur (ex. rail non whitelisté — I6).
 */
export function transition(
  state: SubscriptionStatus,
  event: SubscriptionEvent,
): Result<SubscriptionStatus, string> {
  // I6 — garde dure : un versement ne peut emprunter qu'un rail whitelisté.
  if (event.type === "fund" && !ALLOWED_RAILS.includes(event.rail)) {
    throw new InvariantViolationError("I6", `rail de règlement non autorisé: ${event.rail}`);
  }
  // I2 — garde dure : un versement positif est exigé (pas de dépôt « à blanc »).
  if (event.type === "fund" && event.amountEur <= 0) {
    throw new InvariantViolationError("I2", "montant de versement nul ou négatif");
  }

  const next = TRANSITIONS[state]?.[event.type];
  if (!next) {
    return err(`transition interdite: ${state} --${event.type}--> (refusée)`);
  }
  return ok(next);
}

/** True si l'état est terminal (aucune transition sortante). */
export function isTerminal(state: SubscriptionStatus): boolean {
  return Object.keys(TRANSITIONS[state]).length === 0;
}

/** Liste des événements applicables depuis un état (UI : actions disponibles). */
export function availableEvents(state: SubscriptionStatus): SubscriptionEvent["type"][] {
  return Object.keys(TRANSITIONS[state]) as SubscriptionEvent["type"][];
}

// ── Services à I/O (stubs typés — Jalon 1) ──────────────────────────────────

/**
 * Crée un soft-commit NON ENGAGEANT (I2/I3). Exige TOUJOURS un dealId explicite :
 * il n'existe aucun chemin de souscription « hors deal » (anti-pooling).
 */
export async function createSoftCommit(input: {
  dealId: string; // I2/I3 — obligatoire, jamais une cagnotte globale
  userId: string;
  amountEur: number;
}): Promise<Subscription> {
  if (!input.dealId) {
    throw new InvariantViolationError("I3", "souscription sans dealId explicite");
  }
  const _db = getSupabaseAdmin(); // service-role : filtrer user_id + tenant_id (I9)
  throw new NotImplementedError("subscription.createSoftCommit — Jalon 1");
}

/** Déclenche la signature eIDAS (délègue à ESignaturePort). */
export async function requestSignature(_subscriptionId: string): Promise<void> {
  throw new NotImplementedError("subscription.requestSignature — Jalon 1");
}

/** Annule / rétracte (délai de réflexion 4j ECSP → remboursement via ⑤). */
export async function cancelOrWithdraw(_subscriptionId: string): Promise<void> {
  throw new NotImplementedError("subscription.cancelOrWithdraw — Jalon 1");
}
