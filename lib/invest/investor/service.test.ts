/**
 * lib/invest/investor/service.test.ts — services DB-backed (Epic 1.1).
 *
 * Testés via un InvestorStore EN MÉMOIRE (aucun réseau, aucune DB) : la logique
 * d'orchestration (submitAssessment, linkWallet, getOrCreateProfile, startKyc
 * fail-soft, applyKycWebhook + claim ONCHAINID) est ainsi vérifiable seule.
 *
 * On valide :
 *   - création idempotente du profil (1 par user) ;
 *   - submitAssessment : classification + plafond (plancher 1000€, 5%, averti
 *     non plafonné) ET dénormalisation correcte sur le profil ;
 *   - assertOwnership : un tenant ne lit pas le profil d'un autre (I9) ;
 *   - startKyc : fail-soft (ProviderUnavailableError) si port non configuré ;
 *   - applyKycWebhook : maj du cas + profil + claim ONCHAINID en fail-soft.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getOrCreateProfile,
  updateProfile,
  submitAssessment,
  linkWallet,
  getIdentityStatus,
  startKyc,
  applyKycWebhook,
  type InvestorStore,
  type InvestorCtx,
  type ProfilePatch,
} from "./service";
import { ProviderUnavailableError } from "../shared/errors";
import { InvariantViolationError } from "../shared/errors";
import type { KycPort } from "../ports/kyc";
import type { IdentityRegistryPort } from "../ports/identity-registry";

// ─── Store en mémoire (respecte le filtrage tenant+user) ─────────────────────

interface MemProfile {
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

interface MemKyc {
  id: string;
  investor_profile_id: string;
  user_id: string;
  tenant_id: string;
  provider: string;
  provider_applicant_id: string | null;
  status: string;
  level: string;
  created_at: number;
}

function memStore() {
  const profiles: MemProfile[] = [];
  const assessments: { id: string }[] = [];
  const kycs: MemKyc[] = [];
  let seq = 0;
  const id = (p: string) => `${p}_${++seq}`;

  const store: InvestorStore = {
    async findProfile(ctx) {
      return (
        profiles.find((p) => p.tenant_id === ctx.tenantId && p.user_id === ctx.userId) ?? null
      );
    },
    async createProfile(ctx, patch) {
      const row: MemProfile = {
        id: id("prof"),
        user_id: ctx.userId,
        tenant_id: ctx.tenantId,
        investor_kind: "natural_person",
        full_name: null,
        country: "FR",
        investor_class: "non_sophisticated",
        appropriateness_test_passed: false,
        appropriateness_test_at: null,
        declared_net_worth_eur: null,
        annual_investment_cap_eur: null,
        kyc_status: "none",
        kyc_approved_at: null,
        kyc_expires_at: null,
        wallet_address: null,
        wallet_kind: "none",
        onchainid_address: null,
        status: "active",
        ...(patch as Partial<MemProfile>),
      };
      profiles.push(row);
      return row;
    },
    async updateProfile(ctx, patch) {
      const row = profiles.find((p) => p.tenant_id === ctx.tenantId && p.user_id === ctx.userId);
      if (!row) throw new Error("not_found");
      Object.assign(row, patch as Partial<MemProfile>);
      return row;
    },
    async insertAssessment(ctx, profileId, payload) {
      void ctx;
      void profileId;
      void payload;
      const a = { id: id("ass") };
      assessments.push(a);
      return a;
    },
    async insertKycCase(ctx, profileId, c) {
      const row: MemKyc = {
        id: id("kyc"),
        investor_profile_id: profileId,
        user_id: ctx.userId,
        tenant_id: ctx.tenantId,
        provider: c.provider,
        provider_applicant_id: c.provider_applicant_id ?? null,
        status: c.status,
        level: c.level,
        created_at: ++seq,
      };
      kycs.push(row);
      return row;
    },
    async findLatestKycCase(ctx) {
      const mine = kycs
        .filter((k) => k.tenant_id === ctx.tenantId && k.user_id === ctx.userId)
        .sort((a, b) => b.created_at - a.created_at);
      return mine[0] ?? null;
    },
    async updateKycCaseByApplicant(tenantId, applicantId, patch) {
      const row = kycs.find(
        (k) => k.tenant_id === tenantId && k.provider_applicant_id === applicantId,
      );
      if (!row) return null;
      if (patch.status !== undefined) row.status = patch.status;
      return row;
    },
    async updateProfileById(tenantId, profileId, patch: ProfilePatch) {
      const row = profiles.find((p) => p.tenant_id === tenantId && p.id === profileId);
      if (!row) throw new Error("not_found");
      Object.assign(row, patch as Partial<MemProfile>);
    },
    async findProfileById(tenantId, profileId) {
      return profiles.find((p) => p.tenant_id === tenantId && p.id === profileId) ?? null;
    },
  };

  return { store, profiles, assessments, kycs };
}

const CTX: InvestorCtx = { userId: "user-1", tenantId: "real-estate-agent" };

// ─── getOrCreateProfile ──────────────────────────────────────────────────────

describe("getOrCreateProfile", () => {
  let mem: ReturnType<typeof memStore>;
  beforeEach(() => {
    mem = memStore();
  });

  it("crée le profil une seule fois (idempotent par user)", async () => {
    const a = await getOrCreateProfile(mem.store, CTX);
    const b = await getOrCreateProfile(mem.store, CTX);
    expect(a.id).toBe(b.id);
    expect(mem.profiles).toHaveLength(1);
  });

  it("applique le seed à la création", async () => {
    const p = await getOrCreateProfile(mem.store, CTX, { fullName: "Alice", country: "BE" });
    expect(p.fullName).toBe("Alice");
    expect(p.country).toBe("BE");
  });
});

// ─── assertOwnership (I9) ────────────────────────────────────────────────────

describe("isolation tenant (I9)", () => {
  it("un autre tenant ne voit pas le profil et en crée un nouveau", async () => {
    const mem = memStore();
    await getOrCreateProfile(mem.store, CTX);
    const other = await getOrCreateProfile(mem.store, { userId: "user-1", tenantId: "autre" });
    expect(mem.profiles).toHaveLength(2);
    expect(other.tenantId).toBe("autre");
  });

  it("assertOwnership lève si le store renvoie une ligne d'un autre tenant (sécurité)", async () => {
    // Store malveillant : renvoie une ligne d'un AUTRE tenant.
    const bad: InvestorStore = {
      ...memStore().store,
      async findProfile() {
        return {
          id: "x",
          user_id: "user-1",
          tenant_id: "ATTAQUANT",
          investor_kind: "natural_person",
          full_name: null,
          country: "FR",
          investor_class: "non_sophisticated",
          appropriateness_test_passed: false,
          appropriateness_test_at: null,
          declared_net_worth_eur: null,
          annual_investment_cap_eur: null,
          kyc_status: "none",
          kyc_approved_at: null,
          kyc_expires_at: null,
          wallet_address: null,
          wallet_kind: "none",
          onchainid_address: null,
          status: "active",
        };
      },
    };
    await expect(getOrCreateProfile(bad, CTX)).rejects.toBeInstanceOf(InvariantViolationError);
  });
});

// ─── submitAssessment ────────────────────────────────────────────────────────

describe("submitAssessment", () => {
  let mem: ReturnType<typeof memStore>;
  beforeEach(() => {
    mem = memStore();
  });

  it("non-averti : plancher 1000€ si capacité faible", async () => {
    const r = await submitAssessment(mem.store, CTX, {
      knowledgePassed: true,
      declaresSophisticated: false,
      lossCapacity: { annualIncomeEur: 0, liquidAssetsEur: 0, financialCommitmentsEur: 0 },
    });
    expect(r.classification).toBe("retail");
    expect(r.capCents).toBe(100_000); // 1000€
    // Dénormalisation profil (en euros DB).
    const p = mem.profiles[0];
    expect(p.investor_class).toBe("non_sophisticated");
    expect(p.appropriateness_test_passed).toBe(true);
    expect(p.annual_investment_cap_eur).toBe(1000); // 100000c → 1000€
  });

  it("non-averti : 5% du patrimoine net quand supérieur au plancher", async () => {
    // revenu 60k + actifs 50k − engagements 10k = 100k€ ; 5% = 5000€ = 500000c.
    const r = await submitAssessment(mem.store, CTX, {
      knowledgePassed: true,
      declaresSophisticated: false,
      lossCapacity: {
        annualIncomeEur: 60_000 * 100,
        liquidAssetsEur: 50_000 * 100,
        financialCommitmentsEur: 10_000 * 100,
      },
    });
    expect(r.capCents).toBe(500_000);
    expect(mem.profiles[0].annual_investment_cap_eur).toBe(5000);
    expect(mem.profiles[0].declared_net_worth_eur).toBe(100_000);
  });

  it("averti : aucun plafond (declaresSophisticated + test réussi)", async () => {
    const r = await submitAssessment(mem.store, CTX, {
      knowledgePassed: true,
      declaresSophisticated: true,
      lossCapacity: { annualIncomeEur: 0, liquidAssetsEur: 0, financialCommitmentsEur: 0 },
    });
    expect(r.classification).toBe("sophisticated");
    expect(r.capCents).toBeNull();
    expect(mem.profiles[0].investor_class).toBe("sophisticated");
    expect(mem.profiles[0].annual_investment_cap_eur).toBeNull();
  });

  it("écrit bien un enregistrement d'assessment", async () => {
    await submitAssessment(mem.store, CTX, {
      knowledgePassed: false,
      declaresSophisticated: true,
      lossCapacity: { annualIncomeEur: 0, liquidAssetsEur: 0, financialCommitmentsEur: 0 },
    });
    expect(mem.assessments).toHaveLength(1);
  });
});

// ─── updateProfile / linkWallet ──────────────────────────────────────────────

describe("updateProfile & linkWallet", () => {
  it("met à jour les champs déclaratifs", async () => {
    const mem = memStore();
    const p = await updateProfile(mem.store, CTX, { fullName: "Bob", country: "DE" });
    expect(p.fullName).toBe("Bob");
    expect(p.country).toBe("DE");
  });

  it("lie une adresse EVM (self_custody par défaut)", async () => {
    const mem = memStore();
    const addr = "0x" + "a".repeat(40);
    const p = await linkWallet(mem.store, CTX, { walletAddress: addr });
    expect(p.walletAddress).toBe(addr);
    expect(p.walletKind).toBe("self_custody");
  });
});

// ─── startKyc (fail-soft) ────────────────────────────────────────────────────

describe("startKyc", () => {
  const kycOff: KycPort = {
    isConfigured: () => false,
    startCase: async () => ({ providerCaseId: "x", sdkToken: "t" }),
    verifyWebhook: () => false,
    parseEvent: () => ({ providerCaseId: "", status: "pending", fundOriginVerified: false, providerEventId: "e" }),
  };

  const kycOn: KycPort = {
    isConfigured: () => true,
    startCase: async () => ({ providerCaseId: "appl_1", sdkToken: "tok_1" }),
    verifyWebhook: () => true,
    parseEvent: () => ({ providerCaseId: "appl_1", status: "approved", fundOriginVerified: true, providerEventId: "e1" }),
  };

  it("fail-soft : lève ProviderUnavailableError si non configuré", async () => {
    const mem = memStore();
    await expect(startKyc(mem.store, CTX, kycOff)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("crée un cas KYC pending + passe le profil en pending", async () => {
    const mem = memStore();
    const r = await startKyc(mem.store, CTX, kycOn);
    expect(r.providerCaseId).toBe("appl_1");
    expect(r.sdkToken).toBe("tok_1");
    expect(mem.kycs).toHaveLength(1);
    expect(mem.kycs[0].status).toBe("pending");
    expect(mem.profiles[0].kyc_status).toBe("pending");
  });
});

// ─── applyKycWebhook ─────────────────────────────────────────────────────────

describe("applyKycWebhook", () => {
  const identityOk: IdentityRegistryPort = {
    isConfigured: () => true,
    claimIdentity: async () => ({ onchainIdAddress: "0x" + "b".repeat(40) }),
    isVerified: async () => true,
    getIdentity: async () => null,
  };

  const identityOff: IdentityRegistryPort = {
    isConfigured: () => false,
    claimIdentity: async () => {
      throw new ProviderUnavailableError("onchainid");
    },
    isVerified: async () => false,
    getIdentity: async () => null,
  };

  it("approuvé + wallet présent + identity configuré → claim ONCHAINID", async () => {
    const mem = memStore();
    // Prépare un profil avec wallet + un cas KYC à matcher.
    await linkWallet(mem.store, CTX, { walletAddress: "0x" + "c".repeat(40) });
    const profileId = mem.profiles[0].id;
    await mem.store.insertKycCase(CTX, profileId, {
      provider: "sumsub",
      provider_applicant_id: "appl_99",
      level: "standard",
      status: "pending",
    });

    const res = await applyKycWebhook(
      mem.store,
      "real-estate-agent",
      { providerCaseId: "appl_99", status: "approved", fundOriginVerified: true, providerEventId: "e" },
      identityOk,
    );
    expect(res.matched).toBe(true);
    expect(res.profileId).toBe(profileId);
    expect(res.onchainClaimed).toBe(true);
    expect(mem.profiles[0].kyc_status).toBe("approved");
    expect(mem.profiles[0].onchainid_address).toBe("0x" + "b".repeat(40));
  });

  it("approuvé mais identity non configuré → fail-soft (matched, pas de claim)", async () => {
    const mem = memStore();
    await linkWallet(mem.store, CTX, { walletAddress: "0x" + "d".repeat(40) });
    const profileId = mem.profiles[0].id;
    await mem.store.insertKycCase(CTX, profileId, {
      provider: "sumsub",
      provider_applicant_id: "appl_50",
      level: "standard",
      status: "pending",
    });
    const res = await applyKycWebhook(
      mem.store,
      "real-estate-agent",
      { providerCaseId: "appl_50", status: "approved", fundOriginVerified: true, providerEventId: "e" },
      identityOff,
    );
    expect(res.matched).toBe(true);
    expect(res.onchainClaimed).toBe(false);
    expect(mem.profiles[0].kyc_status).toBe("approved");
    expect(mem.profiles[0].onchainid_address).toBeNull();
  });

  it("rejeté → profil rejected, aucun claim", async () => {
    const mem = memStore();
    const profileId = (await getOrCreateProfile(mem.store, CTX)).id;
    await mem.store.insertKycCase(CTX, profileId, {
      provider: "sumsub",
      provider_applicant_id: "appl_rej",
      level: "standard",
      status: "pending",
    });
    const res = await applyKycWebhook(
      mem.store,
      "real-estate-agent",
      { providerCaseId: "appl_rej", status: "rejected", fundOriginVerified: false, providerEventId: "e" },
      identityOk,
    );
    expect(res.matched).toBe(true);
    expect(res.onchainClaimed).toBe(false);
    expect(mem.profiles[0].kyc_status).toBe("rejected");
  });

  it("aucun cas correspondant → matched=false", async () => {
    const mem = memStore();
    const res = await applyKycWebhook(
      mem.store,
      "real-estate-agent",
      { providerCaseId: "inconnu", status: "approved", fundOriginVerified: true, providerEventId: "e" },
      identityOk,
    );
    expect(res.matched).toBe(false);
    expect(res.profileId).toBeNull();
  });
});

// ─── getIdentityStatus ───────────────────────────────────────────────────────

describe("getIdentityStatus", () => {
  it("fail-soft : onchainVerified=null si port non configuré", async () => {
    const mem = memStore();
    await linkWallet(mem.store, CTX, { walletAddress: "0x" + "e".repeat(40) });
    const off: IdentityRegistryPort = {
      isConfigured: () => false,
      claimIdentity: async () => ({ onchainIdAddress: "0x0" }),
      isVerified: async () => true,
      getIdentity: async () => null,
    };
    const st = await getIdentityStatus(mem.store, CTX, off);
    expect(st.onchainVerified).toBeNull();
    expect(st.walletAddress).toBe("0x" + "e".repeat(40));
  });

  it("expose le dernier cas KYC", async () => {
    const mem = memStore();
    const profileId = (await getOrCreateProfile(mem.store, CTX)).id;
    await mem.store.insertKycCase(CTX, profileId, {
      provider: "sumsub",
      provider_applicant_id: "appl_a",
      level: "standard",
      status: "pending",
    });
    const st = await getIdentityStatus(mem.store, CTX);
    expect(st.latestCase?.provider).toBe("sumsub");
    expect(st.latestCase?.status).toBe("pending");
  });
});
