/**
 * lib/invest/investor/service.ts — ① Investor & Identity : services DB-backed.
 *
 * Couche I/O du contexte Investor (Epic 1.1). La logique métier reste PURE dans
 * `./index.ts` (computeInvestmentCap / classifyFromAssessment) ; ce module fait
 * UNIQUEMENT les lectures/écritures Supabase (service-role) et orchestre.
 *
 * Règles non négociables :
 *   - Le client service-role BYPASS la RLS → on filtre TOUJOURS `user_id` +
 *     `tenant_id` explicitement (I9), et on `assertOwnership` toute ligne lue.
 *   - Montants stockés en euros (numeric DB) ↔ centimes côté domaine (Eur) :
 *     conversion via toCents/toEuros.
 *   - Aucune sélection de deal ici (I3) : on borne seulement la capacité de
 *     souscription de l'investisseur (anti-FIA).
 *
 * Le store Supabase est INJECTABLE (interface `InvestorStore`) pour les tests :
 * la logique d'orchestration (submitAssessment, linkWallet…) est ainsi testable
 * sans réseau, avec un store en mémoire.
 */

import { toCents, toEuros } from "../shared/types";
import { assertOwnership } from "../shared/ownership";
import { ProviderUnavailableError } from "../shared/errors";
import { getSupabaseAdmin } from "../../server/supabase";
import type { KycPort, KycLevel, KycDomainEvent } from "../ports/kyc";
import type { IdentityRegistryPort } from "../ports/identity-registry";
import {
  computeInvestmentCap,
  classifyFromAssessment,
  toInvestorClass,
} from "./index";
import type {
  InvestorClass,
  LossCapacityInputs,
} from "./types";

// ─── Contexte d'appel (issu du JWT vérifié) ──────────────────────────────────

/** Identité de l'appelant pour le filtrage tenant+owner (I9). */
export interface InvestorCtx {
  userId: string;
  tenantId: string;
}

// ─── Vues domaine retournées par le service ──────────────────────────────────

/** Profil + plafonds, vue API (sous-ensemble de inv_investor_profiles). */
export interface ProfileView {
  id: string;
  tenantId: string;
  userId: string;
  investorKind: string;
  fullName: string | null;
  country: string;
  investorClass: InvestorClass;
  appropriatenessTestPassed: boolean;
  appropriatenessTestAt: string | null;
  /** Patrimoine net déclaré, en CENTIMES (null si non renseigné). */
  declaredNetWorthCents: number | null;
  /** Plafond annuel d'investissement, en CENTIMES (null = non plafonné). */
  annualInvestmentCapCents: number | null;
  kycStatus: string;
  kycApprovedAt: string | null;
  kycExpiresAt: string | null;
  walletAddress: string | null;
  walletKind: string;
  onchainidAddress: string | null;
  status: string;
}

/** Résultat d'un assessment soumis (classification + plafond appliqué). */
export interface AssessmentResult {
  assessmentId: string;
  classification: "retail" | "sophisticated";
  investorClass: InvestorClass;
  /** Plafond appliqué (centimes ; null = non plafonné). */
  capCents: number | null;
  isCapped: boolean;
  rationale: string;
  /** Patrimoine net retenu (centimes). */
  netWorthCents: number;
}

/** État consolidé KYC + ONCHAINID + whitelisting (identity/status). */
export interface IdentityStatusView {
  kycStatus: string;
  kycApprovedAt: string | null;
  kycExpiresAt: string | null;
  walletAddress: string | null;
  walletKind: string;
  onchainidAddress: string | null;
  /** Wallet vérifié on-chain (whitelisting ERC-3643) — null si non vérifiable. */
  onchainVerified: boolean | null;
  /** Le cas KYC le plus récent (référence provider), ou null. */
  latestCase: {
    id: string;
    provider: string;
    status: string;
    level: string;
  } | null;
}

// ─── Rows DB (sous-ensembles utiles, alignés database.types.ts) ──────────────

interface ProfileRow {
  id: string;
  user_id: string;
  tenant_id: string;
  investor_kind: string;
  full_name: string | null;
  country: string;
  investor_class: string;
  appropriateness_test_passed: boolean;
  appropriateness_test_at: string | null;
  declared_net_worth_eur: number | null;
  annual_investment_cap_eur: number | null;
  kyc_status: string;
  kyc_approved_at: string | null;
  kyc_expires_at: string | null;
  wallet_address: string | null;
  wallet_kind: string;
  onchainid_address: string | null;
  status: string;
}

interface KycCaseRow {
  id: string;
  investor_profile_id: string;
  user_id: string;
  tenant_id: string;
  provider: string;
  provider_applicant_id: string | null;
  status: string;
  level: string;
}

/** Champs maj du profil (euros DB). */
export interface ProfilePatch {
  full_name?: string | null;
  country?: string;
  investor_kind?: string;
  investor_class?: string;
  appropriateness_test_passed?: boolean;
  appropriateness_test_at?: string | null;
  declared_net_worth_eur?: number | null;
  annual_investment_cap_eur?: number | null;
  kyc_status?: string;
  kyc_approved_at?: string | null;
  kyc_expires_at?: string | null;
  wallet_address?: string | null;
  wallet_kind?: string;
  onchainid_address?: string | null;
}

/** Insert d'un assessment (euros DB). */
export interface AssessmentInsert {
  state: string;
  classification: "retail" | "sophisticated";
  knowledge_score: number | null;
  knowledge_passed: boolean | null;
  annual_income_eur: number | null;
  liquid_assets_eur: number | null;
  financial_commitments_eur: number | null;
  classified_at: string;
  expires_at: string | null;
}

/** Insert d'un cas KYC (euros/refs DB). */
export interface KycCaseInsert {
  provider: string;
  provider_applicant_id?: string | null;
  level: string;
  status: string;
}

/**
 * Store injectable. Toutes les méthodes sont déjà filtrées tenant+user par
 * l'implémentation : le service ré-asserte néanmoins l'appartenance (I9).
 */
export interface InvestorStore {
  findProfile(ctx: InvestorCtx): Promise<ProfileRow | null>;
  createProfile(ctx: InvestorCtx, patch: ProfilePatch): Promise<ProfileRow>;
  updateProfile(ctx: InvestorCtx, patch: ProfilePatch): Promise<ProfileRow>;
  insertAssessment(
    ctx: InvestorCtx,
    profileId: string,
    a: AssessmentInsert,
  ): Promise<{ id: string }>;
  insertKycCase(
    ctx: InvestorCtx,
    profileId: string,
    c: KycCaseInsert,
  ): Promise<KycCaseRow>;
  findLatestKycCase(ctx: InvestorCtx): Promise<KycCaseRow | null>;
  /** Met à jour un cas KYC par référence provider (webhook). Filtré tenant. */
  updateKycCaseByApplicant(
    tenantId: string,
    providerApplicantId: string,
    patch: { status?: string; risk_score?: number | null; approved_at?: string | null; raw_result_hash?: string | null },
  ): Promise<KycCaseRow | null>;
  /** Maj du profil par id de profil (webhook, sans userId de session). */
  updateProfileById(
    tenantId: string,
    profileId: string,
    patch: ProfilePatch,
  ): Promise<void>;
  /** Lit un profil par id (webhook, tenant-scopé). Pour récupérer le wallet. */
  findProfileById(tenantId: string, profileId: string): Promise<ProfileRow | null>;
}

// ─── Mapping Row → View ──────────────────────────────────────────────────────

function toProfileView(row: ProfileRow): ProfileView {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    investorKind: row.investor_kind,
    fullName: row.full_name,
    country: row.country,
    investorClass: row.investor_class as InvestorClass,
    appropriatenessTestPassed: row.appropriateness_test_passed,
    appropriatenessTestAt: row.appropriateness_test_at,
    declaredNetWorthCents: row.declared_net_worth_eur == null ? null : toCents(row.declared_net_worth_eur),
    annualInvestmentCapCents: row.annual_investment_cap_eur == null ? null : toCents(row.annual_investment_cap_eur),
    kycStatus: row.kyc_status,
    kycApprovedAt: row.kyc_approved_at,
    kycExpiresAt: row.kyc_expires_at,
    walletAddress: row.wallet_address,
    walletKind: row.wallet_kind,
    onchainidAddress: row.onchainid_address,
    status: row.status,
  };
}

// ─── Services ────────────────────────────────────────────────────────────────

/** Lit le profil (ou null) puis asserte l'appartenance (I9). */
export async function getProfile(store: InvestorStore, ctx: InvestorCtx): Promise<ProfileView | null> {
  const row = await store.findProfile(ctx);
  if (!row) return null;
  assertOwnership(row, { tenantId: ctx.tenantId, userId: ctx.userId });
  return toProfileView(row);
}

/** Récupère le profil, le crée vide si absent (idempotent au sens « 1 par user »). */
export async function getOrCreateProfile(
  store: InvestorStore,
  ctx: InvestorCtx,
  seed?: { fullName?: string | null; country?: string; investorKind?: string },
): Promise<ProfileView> {
  const existing = await store.findProfile(ctx);
  if (existing) {
    assertOwnership(existing, { tenantId: ctx.tenantId, userId: ctx.userId });
    return toProfileView(existing);
  }
  const created = await store.createProfile(ctx, {
    full_name: seed?.fullName ?? null,
    country: seed?.country ?? "FR",
    investor_kind: seed?.investorKind ?? "natural_person",
  });
  assertOwnership(created, { tenantId: ctx.tenantId, userId: ctx.userId });
  return toProfileView(created);
}

/** Met à jour les champs de profil (hors classification/plafond, gérés par submitAssessment). */
export async function updateProfile(
  store: InvestorStore,
  ctx: InvestorCtx,
  input: { fullName?: string | null; country?: string; investorKind?: string },
): Promise<ProfileView> {
  // Garantit l'existence + l'appartenance avant la maj.
  await getOrCreateProfile(store, ctx);
  const patch: ProfilePatch = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.country !== undefined) patch.country = input.country;
  if (input.investorKind !== undefined) patch.investor_kind = input.investorKind;
  const row = await store.updateProfile(ctx, patch);
  assertOwnership(row, { tenantId: ctx.tenantId, userId: ctx.userId });
  return toProfileView(row);
}

/**
 * Soumet le test ECSP (WF-3) : calcule classification + plafond via la logique
 * PURE, écrit `inv_investor_assessments`, et met à jour `inv_investor_profiles`
 * (classe + plafond + flags du test). Les montants entrent en CENTIMES.
 *
 * @param input.knowledgePassed   test de connaissances réussi.
 * @param input.declaresSophisticated le user demande la classification averti.
 * @param input.lossCapacity      capacité de perte (centimes) — requise pour un retail.
 */
export async function submitAssessment(
  store: InvestorStore,
  ctx: InvestorCtx,
  input: {
    knowledgePassed: boolean;
    knowledgeScore?: number | null;
    declaresSophisticated: boolean;
    lossCapacity: LossCapacityInputs;
  },
): Promise<AssessmentResult> {
  const profile = await getOrCreateProfile(store, ctx);

  // 1. Logique PURE : classification + plafond.
  const classification = classifyFromAssessment({
    knowledgePassed: input.knowledgePassed,
    declaresSophisticated: input.declaresSophisticated,
  });
  const investorClass = toInvestorClass(classification);
  const cap = computeInvestmentCap({ investorClass, lossCapacity: input.lossCapacity });

  const lc = input.lossCapacity;
  const netWorthCents = Math.max(
    0,
    lc.annualIncomeEur + lc.liquidAssetsEur - lc.financialCommitmentsEur,
  );

  // 2. État de l'assessment (aligné CHECK inv_investor_assessments.state).
  const state = classification === "sophisticated" ? "CLASSIFIED_SOPHISTICATED" : "CLASSIFIED_RETAIL";
  const now = new Date();
  const classifiedAt = now.toISOString();
  // Validité : retail +1 an, sophisticated +2 ans (cf. comment migration 0022).
  const expires = new Date(now);
  expires.setFullYear(expires.getFullYear() + (classification === "sophisticated" ? 2 : 1));

  const ins = await store.insertAssessment(ctx, profile.id, {
    state,
    classification,
    knowledge_score: input.knowledgeScore ?? null,
    knowledge_passed: input.knowledgePassed,
    annual_income_eur: toEuros(lc.annualIncomeEur),
    liquid_assets_eur: toEuros(lc.liquidAssetsEur),
    financial_commitments_eur: toEuros(lc.financialCommitmentsEur),
    classified_at: classifiedAt,
    expires_at: expires.toISOString(),
  });

  // 3. Dénormalisation sur le profil (gating rapide).
  await store.updateProfile(ctx, {
    investor_class: investorClass,
    appropriateness_test_passed: input.knowledgePassed,
    appropriateness_test_at: classifiedAt,
    declared_net_worth_eur: toEuros(netWorthCents),
    annual_investment_cap_eur: cap.capEur == null ? null : toEuros(cap.capEur),
  });

  return {
    assessmentId: ins.id,
    classification,
    investorClass,
    capCents: cap.capEur,
    isCapped: cap.isCapped,
    rationale: cap.rationale,
    netWorthCents,
  };
}

/**
 * Lie une adresse EVM au profil (miroir ONCHAINID). La validation du format
 * (0x + 40 hex) est faite côté route (zod) ET garantie par le CHECK DB.
 * Idempotent : relier la même adresse est un no-op fonctionnel.
 */
export async function linkWallet(
  store: InvestorStore,
  ctx: InvestorCtx,
  input: { walletAddress: string; walletKind?: "self_custody" | "embedded" },
): Promise<ProfileView> {
  await getOrCreateProfile(store, ctx);
  const row = await store.updateProfile(ctx, {
    wallet_address: input.walletAddress,
    wallet_kind: input.walletKind ?? "self_custody",
  });
  assertOwnership(row, { tenantId: ctx.tenantId, userId: ctx.userId });
  return toProfileView(row);
}

/**
 * État consolidé KYC + ONCHAINID + whitelisting. Le statut on-chain est tenté
 * via l'IdentityRegistryPort en FAIL-SOFT : si le port n'est pas configuré ou
 * échoue, `onchainVerified` reste null (jamais une exception qui casse la vue).
 */
export async function getIdentityStatus(
  store: InvestorStore,
  ctx: InvestorCtx,
  identity?: IdentityRegistryPort,
): Promise<IdentityStatusView> {
  const profile = await getOrCreateProfile(store, ctx);
  const latest = await store.findLatestKycCase(ctx);

  let onchainVerified: boolean | null = null;
  if (profile.walletAddress && identity?.isConfigured()) {
    try {
      onchainVerified = await identity.isVerified(profile.walletAddress);
    } catch {
      onchainVerified = null; // fail-soft : on n'expose pas l'erreur réseau.
    }
  }

  return {
    kycStatus: profile.kycStatus,
    kycApprovedAt: profile.kycApprovedAt,
    kycExpiresAt: profile.kycExpiresAt,
    walletAddress: profile.walletAddress,
    walletKind: profile.walletKind,
    onchainidAddress: profile.onchainidAddress,
    onchainVerified,
    latestCase: latest
      ? { id: latest.id, provider: latest.provider, status: latest.status, level: latest.level }
      : null,
  };
}

/**
 * Démarre un cas KYC : appelle le KycPort (idempotence gérée par la route via
 * withIdempotency), enregistre un `inv_kyc_cases` (status pending) et passe le
 * profil en kyc_status='pending'. FAIL-SOFT : si le provider n'est pas
 * configuré, lève ProviderUnavailableError (la route renvoie 502).
 */
export async function startKyc(
  store: InvestorStore,
  ctx: InvestorCtx,
  kyc: KycPort,
  opts: { level?: KycLevel } = {},
): Promise<{ providerCaseId: string; sdkToken: string; kycCaseId: string }> {
  if (!kyc.isConfigured()) throw new ProviderUnavailableError("sumsub");
  const profile = await getOrCreateProfile(store, ctx);
  const level: KycLevel = opts.level ?? "standard";

  const res = await kyc.startCase({
    investorId: profile.id,
    externalRef: profile.id,
    level,
    idempotencyKey: `kyc:${ctx.userId}`,
  });

  const row = await store.insertKycCase(ctx, profile.id, {
    provider: "sumsub",
    provider_applicant_id: res.providerCaseId,
    level,
    status: "pending",
  });

  await store.updateProfile(ctx, { kyc_status: "pending" });

  return { providerCaseId: res.providerCaseId, sdkToken: res.sdkToken, kycCaseId: row.id };
}

/** Map le statut KYC normalisé (port) → statut profil (CHECK kyc_status). */
function kycToProfileStatus(s: KycDomainEvent["status"]): string {
  switch (s) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "expired":
      return "expired";
    default:
      return "pending"; // pending | review → pending côté profil
  }
}

/**
 * Applique un événement KYC vérifié (webhook). NE fait PAS la vérif signature
 * ni la dédup (responsabilité de la route, Pattern B) : ici on persiste l'état.
 *
 * 1. maj du `inv_kyc_cases` par référence provider (provider_applicant_id) ;
 * 2. maj du `kyc_status` dénormalisé du profil (+ approved_at si approuvé) ;
 * 3. tentative de claim ONCHAINID en FAIL-SOFT si approuvé + wallet présent.
 *
 * Pas de userId de session ici (webhook) : on retrouve le profil via le cas.
 */
export async function applyKycWebhook(
  store: InvestorStore,
  tenantId: string,
  event: KycDomainEvent & { rawResultHash?: string | null },
  identity?: IdentityRegistryPort,
): Promise<{ matched: boolean; profileId: string | null; onchainClaimed: boolean }> {
  const profileStatus = kycToProfileStatus(event.status);
  const approvedAt = event.status === "approved" ? new Date().toISOString() : null;

  const caseRow = await store.updateKycCaseByApplicant(tenantId, event.providerCaseId, {
    status: event.status,
    approved_at: approvedAt,
    raw_result_hash: event.rawResultHash ?? null,
  });

  if (!caseRow) return { matched: false, profileId: null, onchainClaimed: false };

  const profilePatch: ProfilePatch = { kyc_status: profileStatus };
  if (approvedAt) profilePatch.kyc_approved_at = approvedAt;
  await store.updateProfileById(tenantId, caseRow.investor_profile_id, profilePatch);

  // Claim ONCHAINID en fail-soft (jamais bloquant pour l'ACK 200 du webhook).
  let onchainClaimed = false;
  if (event.status === "approved" && identity?.isConfigured()) {
    // On lit le profil pour récupérer le wallet (sans contexte user — tenant only).
    try {
      const profileRow = await store.findProfileById(tenantId, caseRow.investor_profile_id);
      const wallet = profileRow?.wallet_address ?? null;
      if (wallet) {
        const claim = await identity.claimIdentity({
          wallet,
          kycCaseId: caseRow.id,
          idempotencyKey: `onchainid:${wallet}`,
        });
        await store.updateProfileById(tenantId, caseRow.investor_profile_id, {
          onchainid_address: claim.onchainIdAddress,
        });
        onchainClaimed = true;
      }
    } catch {
      onchainClaimed = false; // fail-soft : le claim sera rejoué par un worker.
    }
  }

  return { matched: true, profileId: caseRow.investor_profile_id, onchainClaimed };
}

// ─── Adaptateur Supabase par défaut (service-role, colonnes réelles 0015/0022) ─

const PROFILE_COLS =
  "id, user_id, tenant_id, investor_kind, full_name, country, investor_class, " +
  "appropriateness_test_passed, appropriateness_test_at, declared_net_worth_eur, " +
  "annual_investment_cap_eur, kyc_status, kyc_approved_at, kyc_expires_at, " +
  "wallet_address, wallet_kind, onchainid_address, status";

const KYC_COLS =
  "id, investor_profile_id, user_id, tenant_id, provider, provider_applicant_id, status, level";

/**
 * Store Supabase aligné sur les colonnes RÉELLES des migrations 0015/0022.
 * Service-role → on filtre `tenant_id` (+ `user_id` quand applicable) partout.
 */
export function supabaseInvestorStore(): InvestorStore {
  const db = getSupabaseAdmin();
  if (!db) {
    throw new Error("[investor] Supabase service-role non configuré");
  }
  return {
    async findProfile(ctx) {
      const { data, error } = await db
        .from("inv_investor_profiles")
        .select(PROFILE_COLS)
        .eq("tenant_id", ctx.tenantId)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ProfileRow | null) ?? null;
    },

    async createProfile(ctx, patch) {
      const { data, error } = await db
        .from("inv_investor_profiles")
        .insert({
          user_id: ctx.userId,
          tenant_id: ctx.tenantId,
          ...patch,
        })
        .select(PROFILE_COLS)
        .single();
      if (error || !data) throw error ?? new Error("create_profile_failed");
      return data as unknown as ProfileRow;
    },

    async updateProfile(ctx, patch) {
      const { data, error } = await db
        .from("inv_investor_profiles")
        .update(patch)
        .eq("tenant_id", ctx.tenantId)
        .eq("user_id", ctx.userId)
        .select(PROFILE_COLS)
        .single();
      if (error || !data) throw error ?? new Error("update_profile_failed");
      return data as unknown as ProfileRow;
    },

    async insertAssessment(ctx, profileId, a) {
      const { data, error } = await db
        .from("inv_investor_assessments")
        .insert({
          user_id: ctx.userId,
          tenant_id: ctx.tenantId,
          investor_profile_id: profileId,
          ...a,
        })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert_assessment_failed");
      return { id: data.id };
    },

    async insertKycCase(ctx, profileId, c) {
      const { data, error } = await db
        .from("inv_kyc_cases")
        .insert({
          user_id: ctx.userId,
          tenant_id: ctx.tenantId,
          investor_profile_id: profileId,
          ...c,
        })
        .select(KYC_COLS)
        .single();
      if (error || !data) throw error ?? new Error("insert_kyc_case_failed");
      return data as unknown as KycCaseRow;
    },

    async findLatestKycCase(ctx) {
      const { data, error } = await db
        .from("inv_kyc_cases")
        .select(KYC_COLS)
        .eq("tenant_id", ctx.tenantId)
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as KycCaseRow | null) ?? null;
    },

    async updateKycCaseByApplicant(tenantId, providerApplicantId, patch) {
      const { data, error } = await db
        .from("inv_kyc_cases")
        .update(patch)
        .eq("tenant_id", tenantId)
        .eq("provider_applicant_id", providerApplicantId)
        .select(KYC_COLS)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as KycCaseRow | null) ?? null;
    },

    async updateProfileById(tenantId, profileId, patch) {
      const { error } = await db
        .from("inv_investor_profiles")
        .update(patch)
        .eq("tenant_id", tenantId)
        .eq("id", profileId);
      if (error) throw error;
    },

    async findProfileById(tenantId, profileId) {
      const { data, error } = await db
        .from("inv_investor_profiles")
        .select(PROFILE_COLS)
        .eq("tenant_id", tenantId)
        .eq("id", profileId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ProfileRow | null) ?? null;
    },
  };
}
