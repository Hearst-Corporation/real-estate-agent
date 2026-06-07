/**
 * lib/invest/subscription/service.ts — ③ Subscription & Order : services DB-backed (Epic 1.3).
 *
 * Couche I/O du parcours de SOUSCRIPTION (P5/P10). La machine à états reste PURE
 * dans `./index.ts` (transition / isTerminal / availableEvents) ; ce module fait
 * UNIQUEMENT les lectures/écritures Supabase (service-role) et orchestre les ports
 * e-signature (eIDAS) + escrow (séquestre tiers).
 *
 * PRINCIPES NON NÉGOCIABLES (mêmes que les services Investor 1.1 / Deal 1.2) :
 *   - Le client service-role BYPASS la RLS → on filtre TOUJOURS `user_id` +
 *     `tenant_id` explicitement (I9) et on `assertOwnership` toute ligne lue.
 *   - TOUTE transition de statut passe par la machine PURE `transition()` et n'est
 *     JAMAIS pilotée par le client : les passages `reserved→signed` et
 *     `signed→funded` arrivent par WEBHOOK (applyEsignWebhook / applyEscrowWebhook).
 *   - Anti-FIA : un soft-commit naît `reserved` (AUCUN versement, exclu du raised
 *     côté SQL) et cible TOUJOURS un deal précis (I2/I3). Le séquestre est un TIERS
 *     PAR DEAL (jamais un compte plateforme — I4).
 *   - Fail-soft : sans clé Yousign/EMI, requestSignature/instructFunding lèvent
 *     ProviderUnavailableError (la route renvoie 502) — la souscription reste dans
 *     son état (reserved/signed), jamais de faux succès.
 *
 * Le store est INJECTABLE (interface `SubscriptionStore`) pour les tests : toute
 * l'orchestration (gardes soft-commit, plafond 12 mois, transitions webhooks,
 * annulation pendant le délai 4j) est vérifiable sans réseau, avec un store mémoire.
 */

import { toEuros } from "../shared/types";
import { assertOwnership, assertTenant } from "../shared/ownership";
import {
  ComplianceBlockedError,
  InvariantViolationError,
  ProviderUnavailableError,
} from "../shared/errors";
import { getSupabaseAdmin } from "../../server/supabase";
import type { ESignaturePort, ESignDomainEvent } from "../ports/esignature";
import type { EscrowPort, EscrowProvider } from "../ports/escrow";
import { transition, availableEvents } from "./index";
import type { SubscriptionStatus, SettlementCurrency } from "./types";

// ─── Constantes métier ────────────────────────────────────────────────────────

/** Délai de réflexion ECSP (Règl. 2020/1503) : 4 jours après signature. */
export const COOLING_OFF_DAYS = 4;

/** Fournisseur de séquestre par défaut (TIERS — jamais la plateforme, I4). */
const DEFAULT_ESCROW_PROVIDER: EscrowProvider = "notaire";

/**
 * Statuts qui comptent dans le plafond ECSP 12 mois glissants. On compte tout
 * engagement ACTIF (y compris `reserved` : un soft-commit immobilise une place ;
 * l'addition ne doit pas pouvoir dépasser le plafond). Les sorties
 * (cancelled/withdrawn/refunded) n'engagent plus → exclues.
 */
const CAP_ACTIVE_STATUSES: readonly SubscriptionStatus[] = [
  "reserved",
  "signed",
  "funded",
  "allocated",
  "minted",
];

// ─── Contexte d'appel (issu du JWT vérifié) ──────────────────────────────────

/** Identité de l'appelant investisseur pour le filtrage tenant+owner (I9). */
export interface SubscriptionCtx {
  userId: string;
  tenantId: string;
  /** Email du signataire (eIDAS) — fourni par la route depuis les claims. */
  signerEmail?: string | null;
}

// ─── Rows DB (sous-ensembles utiles, alignés database.types.ts / 0017) ───────

/** Sous-ensemble de `inv_subscriptions` manipulé par le service. */
export interface SubscriptionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  investor_profile_id: string;
  deal_id: string;
  bond_tranche_id: string;
  amount_eur: number;
  units: number;
  unit_price_eur: number;
  settlement_currency: string;
  status: string;
  cooling_off_ends_at: string | null;
  withdrawn_at: string | null;
  esign_provider: string | null;
  esign_envelope_id: string | null;
  signed_at: string | null;
  reserved_at: string;
  funded_at: string | null;
  allocated_at: string | null;
  minted_at: string | null;
  refunded_at: string | null;
}

/** Données du deal nécessaires aux gardes de souscription (sous-ensemble inv_deals + tranche). */
export interface DealForSubscription {
  id: string;
  tenant_id: string;
  status: string;
  min_ticket_eur: number;
  max_ticket_eur: number | null;
  settlement_currency: string;
  /** Tranche de référence (l'instrument souscrit). */
  bond_tranche_id: string;
  nominal_unit_eur: number;
}

/** Données du profil investisseur nécessaires aux gardes (sous-ensemble inv_investor_profiles). */
export interface ProfileForSubscription {
  id: string;
  tenant_id: string;
  user_id: string;
  investor_class: string;
  kyc_status: string;
  appropriateness_test_passed: boolean;
  /** Plafond annuel en EUROS (numeric DB) ; null = non plafonné (averti). */
  annual_investment_cap_eur: number | null;
}

/** Patch d'écriture sur une souscription (colonnes 0017). */
export interface SubscriptionPatch {
  status?: string;
  cooling_off_ends_at?: string | null;
  withdrawn_at?: string | null;
  esign_provider?: string | null;
  esign_envelope_id?: string | null;
  signed_at?: string | null;
  funded_at?: string | null;
  allocated_at?: string | null;
  minted_at?: string | null;
  refunded_at?: string | null;
}

/** Insert d'un mouvement séquestre (colonnes 0017 inv_escrow_movements). */
export interface EscrowMovementInsert {
  subscription_id: string;
  deal_id: string;
  user_id: string;
  direction: "inflow" | "outflow";
  movement_type: "deposit" | "release_to_spv" | "refund" | "fee";
  amount_eur: number;
  currency: string;
  escrow_provider: EscrowProvider;
  escrow_account_ref: string;
  bank_reference?: string | null;
  status?: string;
}

// ─── Store injectable ─────────────────────────────────────────────────────────

/**
 * Store du contexte souscription. Toutes les méthodes sont filtrées tenant+user
 * côté implémentation ; le service ré-asserte l'appartenance (I9).
 */
export interface SubscriptionStore {
  /** Deal + tranche de référence (gardes : statut open, ticket, devise). Tenant-scopé. */
  findDealForSubscription(tenantId: string, dealId: string): Promise<DealForSubscription | null>;
  /** Profil investisseur du caller (gardes KYC / suitability / plafond). */
  findProfile(ctx: SubscriptionCtx): Promise<ProfileForSubscription | null>;
  /**
   * Somme (EUROS) des souscriptions ACTIVES de l'utilisateur sur les 12 derniers
   * mois glissants (reserved_at ≥ `sinceIso`). Statuts comptés = CAP_ACTIVE_STATUSES.
   * Sert au plafond ECSP. Filtré tenant+user.
   */
  sumActiveSubscriptionsSince(ctx: SubscriptionCtx, sinceIso: string): Promise<number>;
  /** Crée une souscription `reserved` (soft-commit). Renvoie la ligne créée. */
  insertSubscription(
    ctx: SubscriptionCtx,
    row: {
      investor_profile_id: string;
      deal_id: string;
      bond_tranche_id: string;
      amount_eur: number;
      units: number;
      unit_price_eur: number;
      settlement_currency: string;
    },
  ): Promise<SubscriptionRow>;
  /** Lit une souscription par id (filtré tenant+user). */
  findSubscriptionById(ctx: SubscriptionCtx, id: string): Promise<SubscriptionRow | null>;
  /** Liste les souscriptions du caller (filtré tenant+user), récentes d'abord. */
  listSubscriptions(ctx: SubscriptionCtx): Promise<SubscriptionRow[]>;
  /** Met à jour une souscription par id (filtré tenant+user). */
  updateSubscription(ctx: SubscriptionCtx, id: string, patch: SubscriptionPatch): Promise<SubscriptionRow>;
  /** Insère un mouvement séquestre (miroir comptable). Filtré tenant. */
  insertEscrowMovement(tenantId: string, mv: EscrowMovementInsert): Promise<{ id: string }>;
  /** Somme (EUROS) des dépôts confirmés en séquestre pour une souscription (refund). */
  sumConfirmedDeposits(tenantId: string, subscriptionId: string): Promise<number>;

  // ── Variantes WEBHOOK (sans contexte user : retrouvées par référence provider) ──
  /** Lit une souscription par enveloppe e-sign (webhook esign), tenant-scopé. */
  findSubscriptionByEnvelope(tenantId: string, envelopeId: string): Promise<SubscriptionRow | null>;
  /** Lit une souscription par id (webhook escrow), tenant-scopé sans user. */
  findSubscriptionByIdTenant(tenantId: string, id: string): Promise<SubscriptionRow | null>;
  /** Met à jour une souscription par id (webhook), tenant-scopé sans user. */
  updateSubscriptionByIdTenant(tenantId: string, id: string, patch: SubscriptionPatch): Promise<SubscriptionRow>;
}

// ─── Vue domaine renvoyée par le service ──────────────────────────────────────

/** Souscription, vue API (montants en EUROS, alignés UI). */
export interface SubscriptionView {
  id: string;
  tenantId: string;
  userId: string;
  dealId: string;
  bondTrancheId: string;
  status: SubscriptionStatus;
  amountEur: number;
  units: number;
  unitPriceEur: number;
  settlementCurrency: SettlementCurrency;
  coolingOffEndsAt: string | null;
  signedAt: string | null;
  fundedAt: string | null;
  reservedAt: string;
  esignEnvelopeId: string | null;
  /** Actions UI applicables depuis l'état courant (machine pure). */
  availableActions: string[];
  /** True si on est encore dans le délai de réflexion 4j (annulation possible). */
  withinCoolingOff: boolean;
}

// ─── Mapping Row → View ──────────────────────────────────────────────────────

function isWithinCoolingOff(coolingOffEndsAt: string | null, now = Date.now()): boolean {
  if (!coolingOffEndsAt) return false;
  const end = new Date(coolingOffEndsAt).getTime();
  if (Number.isNaN(end)) return false;
  return now <= end;
}

function toView(row: SubscriptionRow): SubscriptionView {
  const status = row.status as SubscriptionStatus;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    dealId: row.deal_id,
    bondTrancheId: row.bond_tranche_id,
    status,
    amountEur: row.amount_eur,
    units: row.units,
    unitPriceEur: row.unit_price_eur,
    settlementCurrency: row.settlement_currency as SettlementCurrency,
    coolingOffEndsAt: row.cooling_off_ends_at,
    signedAt: row.signed_at,
    fundedAt: row.funded_at,
    reservedAt: row.reserved_at,
    esignEnvelopeId: row.esign_envelope_id,
    availableActions: availableEvents(status),
    withinCoolingOff: isWithinCoolingOff(row.cooling_off_ends_at),
  };
}

// ─── Logique PURE : plafond ECSP 12 mois glissants ────────────────────────────

/**
 * Vérifie le plafond ECSP (12 mois glissants) pour un non-averti. PUR.
 *
 * Règle : pour un investisseur PLAFONNÉ (non_sophisticated, `capEur` non null),
 * la somme des souscriptions ACTIVES des 12 derniers mois + le NOUVEAU ticket ne
 * doit pas dépasser le plafond. Un averti (capEur null) n'est jamais plafonné.
 *
 * @param capEur            plafond annuel (EUROS) ; null = pas de plafond (averti).
 * @param activeSumEur      somme (EUROS) des souscriptions actives des 12 derniers mois.
 * @param newTicketEur      montant (EUROS) du nouveau soft-commit.
 * @returns { ok, remainingEur, wouldBeEur } — ok=false si dépassement.
 */
export function checkAnnualCap(
  capEur: number | null,
  activeSumEur: number,
  newTicketEur: number,
): { ok: boolean; capEur: number | null; remainingEur: number | null; wouldBeEur: number } {
  const wouldBeEur = activeSumEur + newTicketEur;
  if (capEur == null) {
    return { ok: true, capEur: null, remainingEur: null, wouldBeEur };
  }
  const remainingEur = Math.max(0, capEur - activeSumEur);
  // Tolérance d'arrondi au centime pour éviter un rejet sur du bruit flottant.
  return { ok: wouldBeEur <= capEur + 0.001, capEur, remainingEur, wouldBeEur };
}

/** ISO de la borne « il y a 12 mois » (fenêtre glissante du plafond). PUR. */
export function twelveMonthsAgoIso(now = new Date()): string {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

/** Suitability : averti (sophisticated/professional) OU test ECSP réussi. PUR. */
export function isSuitable(profile: ProfileForSubscription): boolean {
  const averti = profile.investor_class === "sophisticated" || profile.investor_class === "professional";
  return averti || profile.appropriateness_test_passed === true;
}

// ─── Services ────────────────────────────────────────────────────────────────

/**
 * Crée un SOFT-COMMIT non engageant (statut `reserved`, AUCUN versement). I2/I3.
 *
 * Gardes (toutes serveur) :
 *   1. deal existe + statut `open` ;
 *   2. KYC approuvé (gate identité) ;
 *   3. suitability : averti OU test d'adéquation ECSP réussi ;
 *   4. ticket ∈ [min, max] du deal ;
 *   5. plafond ECSP 12 mois glissants (non-avertis) non dépassé (somme active + ticket).
 *
 * Aucune transition de statut ici autre que la création (`reserved`). Le montant
 * entre/sort en EUROS (numeric DB). Les unités sont dérivées du nominal de la tranche.
 *
 * @throws InvariantViolationError (deal introuvable / cohérence) ;
 *         ComplianceBlockedError (deal fermé, KYC, suitability, ticket, plafond).
 */
export async function createSoftCommit(
  store: SubscriptionStore,
  ctx: SubscriptionCtx,
  dealId: string,
  amountEur: number,
): Promise<SubscriptionView> {
  if (!dealId) throw new InvariantViolationError("I3", "souscription sans dealId explicite");
  if (!(amountEur > 0)) throw new ComplianceBlockedError("amount_must_be_positive");

  // 1. Deal + tranche.
  const deal = await store.findDealForSubscription(ctx.tenantId, dealId);
  if (!deal) throw new InvariantViolationError("I3", `deal introuvable (${dealId})`);
  assertTenant(deal as { tenant_id: string }, ctx.tenantId);
  if (deal.status !== "open") {
    throw new ComplianceBlockedError(`deal_not_open:${deal.status}`);
  }

  // 2/3. Profil : KYC approuvé + suitability.
  const profile = await store.findProfile(ctx);
  if (!profile) throw new ComplianceBlockedError("investor_profile_required");
  assertOwnership(profile as { tenant_id: string; user_id: string }, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });
  if (profile.kyc_status !== "approved") {
    throw new ComplianceBlockedError("kyc_not_approved");
  }
  if (!isSuitable(profile)) {
    throw new ComplianceBlockedError("suitability_required");
  }

  // 4. Ticket dans [min, max].
  if (amountEur < deal.min_ticket_eur) {
    throw new ComplianceBlockedError(`ticket_below_min:${deal.min_ticket_eur}`);
  }
  if (deal.max_ticket_eur != null && amountEur > deal.max_ticket_eur) {
    throw new ComplianceBlockedError(`ticket_above_max:${deal.max_ticket_eur}`);
  }

  // 5. Plafond ECSP 12 mois glissants (non-averti seulement).
  const sinceIso = twelveMonthsAgoIso();
  const activeSum = await store.sumActiveSubscriptionsSince(ctx, sinceIso);
  const cap = checkAnnualCap(profile.annual_investment_cap_eur, activeSum, amountEur);
  if (!cap.ok) {
    throw new ComplianceBlockedError(
      `annual_cap_exceeded:remaining=${cap.remainingEur ?? 0}:cap=${cap.capEur ?? 0}`,
    );
  }

  // Unités dérivées du nominal de la tranche (cohérence DB : amount ≈ units*unit).
  const unitPrice = deal.nominal_unit_eur > 0 ? deal.nominal_unit_eur : 1;
  const units = Math.max(1, Math.round(amountEur / unitPrice));
  // On aligne le montant sur units*unitPrice pour respecter le CHECK de cohérence
  // (abs(amount - units*unit) < 0.01) — le ticket réservé est un multiple du nominal.
  const alignedAmount = units * unitPrice;

  const row = await store.insertSubscription(ctx, {
    investor_profile_id: profile.id,
    deal_id: deal.id,
    bond_tranche_id: deal.bond_tranche_id,
    amount_eur: alignedAmount,
    units,
    unit_price_eur: unitPrice,
    settlement_currency: deal.settlement_currency,
  });
  assertOwnership(row as { tenant_id: string; user_id: string }, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });
  return toView(row);
}

/**
 * Déclenche la SIGNATURE eIDAS (③). Exige une souscription `reserved`. Délègue à
 * l'ESignaturePort (fail-soft : ProviderUnavailableError si non configuré → 502).
 *
 * NB : le passage `reserved→signed` N'A PAS LIEU ICI — il arrive au WEBHOOK esign
 * (applyEsignWebhook). On mémorise seulement l'enveloppe + le provider.
 *
 * @throws ComplianceBlockedError si la souscription n'est pas `reserved` ;
 *         ProviderUnavailableError si Yousign n'est pas configuré.
 */
export async function requestSignature(
  store: SubscriptionStore,
  ctx: SubscriptionCtx,
  esign: ESignaturePort,
  subId: string,
  opts: { idempotencyKey: string },
): Promise<{ envelopeId: string; signUrl: string }> {
  const sub = await store.findSubscriptionById(ctx, subId);
  if (!sub) throw new InvariantViolationError("I9", `souscription introuvable (${subId})`);
  assertOwnership(sub as { tenant_id: string; user_id: string }, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });
  if (sub.status !== "reserved") {
    throw new ComplianceBlockedError(`signature_requires_reserved:${sub.status}`);
  }
  if (!esign.isConfigured()) throw new ProviderUnavailableError("yousign");

  const signerEmail = ctx.signerEmail || "";
  const res = await esign.requestSignature({
    subscriptionId: sub.id,
    docKind: "bulletin_souscription",
    level: "AdES",
    signerEmail,
    idempotencyKey: opts.idempotencyKey,
  });

  // On trace l'enveloppe (la transition vers `signed` viendra du webhook).
  await store.updateSubscription(ctx, sub.id, {
    esign_provider: "yousign",
    esign_envelope_id: res.envelopeId,
  });
  return res;
}

/**
 * Instruit le VERSEMENT vers le SÉQUESTRE TIERS (I4). Exige une souscription
 * `signed`. Délègue à l'EscrowPort.createDepositInstruction (fail-soft → 502).
 * Pose `cooling_off_ends_at = now + 4j` (délai de réflexion ECSP).
 *
 * NB : le passage `signed→funded` N'A PAS LIEU ICI — il arrive au WEBHOOK escrow
 * (applyEscrowWebhook) quand le tiers confirme la réception des fonds.
 *
 * @throws ComplianceBlockedError si la souscription n'est pas `signed` ;
 *         ProviderUnavailableError si l'escrow n'est pas configuré.
 */
export async function instructFunding(
  store: SubscriptionStore,
  ctx: SubscriptionCtx,
  escrow: EscrowPort,
  subId: string,
  opts: { idempotencyKey: string; escrowAccountRef?: string },
): Promise<{ providerRef: string; instructions: Record<string, string>; coolingOffEndsAt: string }> {
  const sub = await store.findSubscriptionById(ctx, subId);
  if (!sub) throw new InvariantViolationError("I9", `souscription introuvable (${subId})`);
  assertOwnership(sub as { tenant_id: string; user_id: string }, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });
  if (sub.status !== "signed") {
    throw new ComplianceBlockedError(`funding_requires_signed:${sub.status}`);
  }
  if (!escrow.isConfigured()) throw new ProviderUnavailableError("escrow-emi-notaire");

  const accountRef = opts.escrowAccountRef || `escrow:${sub.deal_id}`;
  const res = await escrow.createDepositInstruction({
    account: { dealId: sub.deal_id, provider: DEFAULT_ESCROW_PROVIDER, externalRef: accountRef },
    subscriptionId: sub.id,
    amountEur: sub.amount_eur,
    idempotencyKey: opts.idempotencyKey,
  });

  // Mouvement séquestre `deposit` en attente (miroir comptable, status pending).
  await store.insertEscrowMovement(ctx.tenantId, {
    subscription_id: sub.id,
    deal_id: sub.deal_id,
    user_id: sub.user_id,
    direction: "inflow",
    movement_type: "deposit",
    amount_eur: sub.amount_eur,
    currency: sub.settlement_currency,
    escrow_provider: DEFAULT_ESCROW_PROVIDER,
    escrow_account_ref: accountRef,
    bank_reference: res.providerRef || null,
    status: "pending",
  });

  // Délai de réflexion 4j (ECSP) : posé à l'instruction de versement.
  const coolingOffEndsAt = new Date(Date.now() + COOLING_OFF_DAYS * 86_400_000).toISOString();
  await store.updateSubscription(ctx, sub.id, { cooling_off_ends_at: coolingOffEndsAt });

  return { providerRef: res.providerRef, instructions: res.instructions, coolingOffEndsAt };
}

/**
 * ANNULE / rétracte une souscription pendant le délai de réflexion 4j (ECSP).
 *
 * - `reserved`/`signed` (avant versement confirmé) → `cancelled` (transition `cancel`)
 *   ou, si déjà signé, `withdrawn` (transition `withdraw`, rétractation eIDAS).
 * - `funded` (fonds reçus en séquestre, encore dans le délai) → `refunded`
 *   (transition `refund`) AVEC remboursement intégral via EscrowPort.refund.
 *
 * GARDE : l'annulation d'une souscription `funded` n'est possible QUE pendant le
 * délai 4j (`cooling_off_ends_at` non dépassé). Hors délai → ComplianceBlockedError.
 *
 * @throws ComplianceBlockedError si hors délai ou état non annulable ;
 *         ProviderUnavailableError si refund requis mais escrow non configuré.
 */
export async function cancel(
  store: SubscriptionStore,
  ctx: SubscriptionCtx,
  subId: string,
  escrow: EscrowPort,
  opts: { idempotencyKey: string },
): Promise<SubscriptionView> {
  const sub = await store.findSubscriptionById(ctx, subId);
  if (!sub) throw new InvariantViolationError("I9", `souscription introuvable (${subId})`);
  assertOwnership(sub as { tenant_id: string; user_id: string }, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });

  const status = sub.status as SubscriptionStatus;

  // ── Cas 1 : avant versement (reserved/signed) ───────────────────────────────
  if (status === "reserved" || status === "signed") {
    // Depuis `signed`, l'annulation EST une rétractation eIDAS (→ withdrawn) ; on
    // privilégie `cancel` (→ cancelled) si la transition existe, sinon `withdraw`.
    const eventType = status === "reserved" ? "cancel" : "withdraw";
    const r = transition(status, { type: eventType });
    if (!r.ok) throw new ComplianceBlockedError(`cancel_not_allowed:${status}`);
    const patch: SubscriptionPatch = { status: r.value };
    if (eventType === "withdraw") patch.withdrawn_at = new Date().toISOString();
    const row = await store.updateSubscription(ctx, sub.id, patch);
    return toView(row);
  }

  // ── Cas 2 : fonds reçus (funded) → uniquement pendant le délai 4j ────────────
  if (status === "funded") {
    if (!isWithinCoolingOff(sub.cooling_off_ends_at)) {
      throw new ComplianceBlockedError("cooling_off_expired");
    }
    const r = transition("funded", { type: "refund" });
    if (!r.ok) throw new ComplianceBlockedError("cancel_not_allowed:funded");

    // Remboursement INTÉGRAL via le séquestre tiers (fail-soft : 502 si non configuré).
    if (!escrow.isConfigured()) throw new ProviderUnavailableError("escrow-emi-notaire");
    const accountRef = `escrow:${sub.deal_id}`;
    const refundEur = await store.sumConfirmedDeposits(ctx.tenantId, sub.id);
    const amount = refundEur > 0 ? refundEur : sub.amount_eur;
    const ref = await escrow.refund({
      account: { dealId: sub.deal_id, provider: DEFAULT_ESCROW_PROVIDER, externalRef: accountRef },
      subscriptionId: sub.id,
      amountEur: amount,
      idempotencyKey: opts.idempotencyKey,
    });
    await store.insertEscrowMovement(ctx.tenantId, {
      subscription_id: sub.id,
      deal_id: sub.deal_id,
      user_id: sub.user_id,
      direction: "outflow",
      movement_type: "refund",
      amount_eur: amount,
      currency: sub.settlement_currency,
      escrow_provider: DEFAULT_ESCROW_PROVIDER,
      escrow_account_ref: accountRef,
      bank_reference: ref.providerRef || null,
      status: "pending",
    });
    const row = await store.updateSubscription(ctx, sub.id, {
      status: "refunded",
      refunded_at: new Date().toISOString(),
    });
    return toView(row);
  }

  // Tout autre état (allocated/minted/terminaux) n'est pas annulable par l'investisseur.
  throw new ComplianceBlockedError(`cancel_not_allowed:${status}`);
}

/** Liste les souscriptions du caller (filtré tenant+user, récentes d'abord). */
export async function listMySubscriptions(
  store: SubscriptionStore,
  ctx: SubscriptionCtx,
): Promise<SubscriptionView[]> {
  const rows = await store.listSubscriptions(ctx);
  return rows.map((row) => {
    assertOwnership(row as { tenant_id: string; user_id: string }, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });
    return toView(row);
  });
}

// ─── WEBHOOKS : avancent la machine via transition() (pure) puis persistent ────

/**
 * Applique un événement e-signature vérifié (webhook). NE fait PAS la vérif de
 * signature ni la dédup (responsabilité de la route, Pattern B). Sur un état
 * `SIGNED` Yousign, exécute `transition(reserved, sign)` (pure) et persiste
 * `signed` + `signed_at`. Toute transition invalide est REJETÉE (jamais piloté client).
 *
 * Pas de userId de session (webhook) : on retrouve la souscription par enveloppe.
 *
 * @returns { matched, subscriptionId, newStatus | null }.
 */
export async function applyEsignWebhook(
  store: SubscriptionStore,
  tenantId: string,
  event: ESignDomainEvent,
): Promise<{ matched: boolean; subscriptionId: string | null; newStatus: SubscriptionStatus | null }> {
  // On ne fait avancer la machine que sur un état SIGNED (les autres = no-op ACK).
  if (event.state !== "SIGNED") {
    return { matched: false, subscriptionId: null, newStatus: null };
  }
  const sub = await store.findSubscriptionByEnvelope(tenantId, event.envelopeId);
  if (!sub) return { matched: false, subscriptionId: null, newStatus: null };
  assertTenant(sub as { tenant_id: string }, tenantId);

  const current = sub.status as SubscriptionStatus;
  // Idempotence métier : déjà `signed` (ou au-delà) → no-op succès.
  if (current !== "reserved") {
    return { matched: true, subscriptionId: sub.id, newStatus: current };
  }
  const r = transition("reserved", { type: "sign", envelopeId: event.envelopeId });
  if (!r.ok) {
    // Transition refusée par la machine pure → on n'altère rien (jamais de statut forcé).
    throw new InvariantViolationError("I3", `transition esign refusée: ${current}->signed`);
  }
  const updated = await store.updateSubscriptionByIdTenant(tenantId, sub.id, {
    status: r.value,
    signed_at: new Date().toISOString(),
    esign_envelope_id: event.envelopeId,
  });
  return { matched: true, subscriptionId: updated.id, newStatus: r.value };
}

/** Événement escrow normalisé (parse local côté route — pas de port parseEvent). */
export interface EscrowDomainEvent {
  subscriptionId: string;
  /** Type de confirmation du tiers : 'deposit_confirmed' fait avancer signed→funded. */
  movementType: "deposit_confirmed" | "refund_confirmed" | "release_confirmed" | string;
  providerEventId: string;
  bankReference?: string | null;
}

/**
 * Applique un événement séquestre vérifié (webhook). Sur `deposit_confirmed`,
 * exécute `transition(signed, fund)` (pure) et persiste `funded` + `funded_at`.
 * Toute transition invalide est REJETÉE. Retrouve la souscription par son id.
 *
 * @returns { matched, subscriptionId, newStatus | null }.
 */
export async function applyEscrowWebhook(
  store: SubscriptionStore,
  tenantId: string,
  event: EscrowDomainEvent,
): Promise<{ matched: boolean; subscriptionId: string | null; newStatus: SubscriptionStatus | null }> {
  const sub = await store.findSubscriptionByIdTenant(tenantId, event.subscriptionId);
  if (!sub) return { matched: false, subscriptionId: null, newStatus: null };
  assertTenant(sub as { tenant_id: string }, tenantId);
  const current = sub.status as SubscriptionStatus;

  if (event.movementType === "deposit_confirmed") {
    // Idempotence métier : déjà funded (ou au-delà) → no-op succès.
    if (current !== "signed") {
      return { matched: true, subscriptionId: sub.id, newStatus: current };
    }
    const r = transition("signed", {
      type: "fund",
      rail: sub.settlement_currency as SettlementCurrency,
      amountEur: sub.amount_eur,
    });
    if (!r.ok) {
      throw new InvariantViolationError("I2", `transition escrow refusée: ${current}->funded`);
    }
    await store.insertEscrowMovement(tenantId, {
      subscription_id: sub.id,
      deal_id: sub.deal_id,
      user_id: sub.user_id,
      direction: "inflow",
      movement_type: "deposit",
      amount_eur: sub.amount_eur,
      currency: sub.settlement_currency,
      escrow_provider: DEFAULT_ESCROW_PROVIDER,
      escrow_account_ref: `escrow:${sub.deal_id}`,
      bank_reference: event.bankReference ?? null,
      status: "confirmed",
    });
    const updated = await store.updateSubscriptionByIdTenant(tenantId, sub.id, {
      status: r.value,
      funded_at: new Date().toISOString(),
    });
    return { matched: true, subscriptionId: updated.id, newStatus: r.value };
  }

  // Autres confirmations (refund/release) : ACK sans changement d'état piloté ici.
  return { matched: true, subscriptionId: sub.id, newStatus: current };
}

// ─── Adaptateur Supabase par défaut (service-role, colonnes réelles 0017) ─────

const SUB_COLS =
  "id, tenant_id, user_id, investor_profile_id, deal_id, bond_tranche_id, amount_eur, units, " +
  "unit_price_eur, settlement_currency, status, cooling_off_ends_at, withdrawn_at, esign_provider, " +
  "esign_envelope_id, signed_at, reserved_at, funded_at, allocated_at, minted_at, refunded_at";

/**
 * Store Supabase aligné sur les colonnes RÉELLES de la migration 0017.
 * Service-role → on filtre `tenant_id` (+ `user_id` quand applicable) partout (I9).
 */
export function supabaseSubscriptionStore(): SubscriptionStore {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("[subscription] Supabase service-role non configuré");

  return {
    async findDealForSubscription(tenantId, dealId) {
      const { data: deal, error } = await db
        .from("inv_deals")
        .select("id, tenant_id, status, min_ticket_eur, max_ticket_eur, settlement_currency")
        .eq("tenant_id", tenantId)
        .eq("id", dealId)
        .maybeSingle();
      if (error) throw error;
      if (!deal) return null;
      // Tranche de référence (la plus senior / première) : nominal + id.
      const { data: tranche, error: trErr } = await db
        .from("inv_bond_tranches")
        .select("id, nominal_unit_eur")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .order("waterfall_rank", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (trErr) throw trErr;
      const d = deal as {
        id: string;
        tenant_id: string;
        status: string;
        min_ticket_eur: number;
        max_ticket_eur: number | null;
        settlement_currency: string;
      };
      const t = (tranche as { id: string; nominal_unit_eur: number } | null) ?? null;
      if (!t) return null; // pas de tranche → pas d'instrument souscriptible.
      return {
        id: d.id,
        tenant_id: d.tenant_id,
        status: d.status,
        min_ticket_eur: d.min_ticket_eur,
        max_ticket_eur: d.max_ticket_eur,
        settlement_currency: d.settlement_currency,
        bond_tranche_id: t.id,
        nominal_unit_eur: t.nominal_unit_eur,
      };
    },

    async findProfile(ctx) {
      const { data, error } = await db
        .from("inv_investor_profiles")
        .select("id, tenant_id, user_id, investor_class, kyc_status, appropriateness_test_passed, annual_investment_cap_eur")
        .eq("tenant_id", ctx.tenantId)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ProfileForSubscription | null) ?? null;
    },

    async sumActiveSubscriptionsSince(ctx, sinceIso) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .select("amount_eur")
        .eq("tenant_id", ctx.tenantId)
        .eq("user_id", ctx.userId)
        .in("status", CAP_ACTIVE_STATUSES as unknown as string[])
        .gte("reserved_at", sinceIso);
      if (error) throw error;
      const rows = (data as { amount_eur: number }[] | null) ?? [];
      return rows.reduce((acc, r) => acc + Number(r.amount_eur || 0), 0);
    },

    async insertSubscription(ctx, row) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .insert({
          tenant_id: ctx.tenantId,
          user_id: ctx.userId,
          status: "reserved",
          ...row,
        })
        .select(SUB_COLS)
        .single();
      if (error || !data) throw error ?? new Error("insert_subscription_failed");
      return data as unknown as SubscriptionRow;
    },

    async findSubscriptionById(ctx, id) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .select(SUB_COLS)
        .eq("tenant_id", ctx.tenantId)
        .eq("user_id", ctx.userId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SubscriptionRow | null) ?? null;
    },

    async listSubscriptions(ctx) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .select(SUB_COLS)
        .eq("tenant_id", ctx.tenantId)
        .eq("user_id", ctx.userId)
        .order("reserved_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as SubscriptionRow[]) ?? [];
    },

    async updateSubscription(ctx, id, patch) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .update(patch)
        .eq("tenant_id", ctx.tenantId)
        .eq("user_id", ctx.userId)
        .eq("id", id)
        .select(SUB_COLS)
        .single();
      if (error || !data) throw error ?? new Error("update_subscription_failed");
      return data as unknown as SubscriptionRow;
    },

    async insertEscrowMovement(tenantId, mv) {
      const { data, error } = await db
        .from("inv_escrow_movements")
        .insert({ tenant_id: tenantId, ...mv })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert_escrow_movement_failed");
      return { id: (data as { id: string }).id };
    },

    async sumConfirmedDeposits(tenantId, subscriptionId) {
      const { data, error } = await db
        .from("inv_escrow_movements")
        .select("amount_eur")
        .eq("tenant_id", tenantId)
        .eq("subscription_id", subscriptionId)
        .eq("movement_type", "deposit")
        .in("status", ["confirmed", "reconciled"]);
      if (error) throw error;
      const rows = (data as { amount_eur: number }[] | null) ?? [];
      return rows.reduce((acc, r) => acc + Number(r.amount_eur || 0), 0);
    },

    async findSubscriptionByEnvelope(tenantId, envelopeId) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .select(SUB_COLS)
        .eq("tenant_id", tenantId)
        .eq("esign_envelope_id", envelopeId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SubscriptionRow | null) ?? null;
    },

    async findSubscriptionByIdTenant(tenantId, id) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .select(SUB_COLS)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SubscriptionRow | null) ?? null;
    },

    async updateSubscriptionByIdTenant(tenantId, id, patch) {
      const { data, error } = await db
        .from("inv_subscriptions")
        .update(patch)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select(SUB_COLS)
        .single();
      if (error || !data) throw error ?? new Error("update_subscription_tenant_failed");
      return data as unknown as SubscriptionRow;
    },
  };
}

// `toEuros` réexporté pour les routes (cohérence centimes↔euros si besoin).
export { toEuros };
