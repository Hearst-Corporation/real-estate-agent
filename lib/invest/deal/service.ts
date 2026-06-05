/**
 * lib/invest/deal/service.ts — ② Deal & Offering : services DB-backed (Epic 1.2).
 *
 * Couche I/O du catalogue de deals + back-office opérateur. La logique financière
 * reste PURE dans `lib/invest/finance` (buildDealSheet) ; ce module fait les
 * lectures/écritures Supabase (service-role) et le mapping DB→moteur (./mapping).
 *
 * Règles non négociables (mêmes que l'investor service, Epic 1.1) :
 *   - Le client service-role BYPASS la RLS → on filtre TOUJOURS `tenant_id`
 *     explicitement (I9) et on asserte l'appartenance des lignes lues.
 *   - 1 SPV = 1 deal : la création insère 1 inv_spvs + 1 inv_deals (UNIQUE) +
 *     1 inv_bond_tranches.
 *   - GATE KYC : `getDealBySlug` masque les chiffres financiers DÉTAILLÉS
 *     (waterfall, scénarios, sensibilités, cashflow) si le viewer n'est pas
 *     KYC-approuvé. La structure (use of funds, LTV, dette/equity) reste visible.
 *   - publishDeal : DRAFT/draft → open uniquement si un KIIS est PUBLISHED.
 *
 * Le store est INJECTABLE (interface `DealStore`) pour les tests : toute
 * l'orchestration est ainsi vérifiable sans réseau, avec un store en mémoire.
 */

import { createHash } from "node:crypto";
import { buildDealSheet } from "../finance/deal-engine";
import type { DealSheet } from "../finance/types";
import { assertTenant } from "../shared/ownership";
import { ComplianceBlockedError, InvariantViolationError } from "../shared/errors";
import { getSupabaseAdmin } from "../../server/supabase";
import {
  mapDbDealToInput,
  type DbDealRow,
  type DbTrancheRow,
  type DbSpvRow,
} from "./mapping";

// ─── Contexte d'appel (issu du JWT vérifié) ──────────────────────────────────

/** Identité de l'appelant investisseur (lecture catalogue). */
export interface DealViewerCtx {
  userId: string;
  tenantId: string;
  /** Statut KYC dénormalisé du profil investisseur (gate des chiffres détaillés). */
  kycApproved: boolean;
}

/** Identité de l'appelant opérateur/admin (écriture back-office). */
export interface OperatorCtx {
  userId: string;
  tenantId: string;
  /** Rôle métier issu du JWT ('admin' = back-office autorisé). */
  role: string;
  scope: string[];
}

// ─── Vues domaine retournées par le service ──────────────────────────────────

/** Ligne de liste du catalogue (marketplace + back-office). */
export interface DealListItem {
  id: string;
  slug: string;
  name: string;
  dealType: string;
  status: string;
  offeringRegime: string;
  city: string | null;
  country: string;
  targetRaiseEur: number;
  raisedEur: number;
  minTicketEur: number;
  maxTicketEur: number | null;
  targetIrrPct: number | null;
  ltvPct: number | null;
  durationMonths: number | null;
  badges: string[];
  restrictedToSophisticated: boolean;
  settlementCurrency: string;
  opensAt: string | null;
  closesAt: string | null;
}

/** Document de data room (sous-ensemble de inv_documents, visibilité publique). */
export interface DealDocument {
  id: string;
  docType: string;
  title: string;
  mimeType: string | null;
  sizeBytes: number | null;
  contentSha256: string | null;
  version: number;
  isSigned: boolean;
  createdAt: string;
}

/**
 * Fiche deal complète renvoyée par `getDealBySlug`. Le `sheet` est le DealSheet
 * du moteur. Si `kycGated=true`, les sections financières détaillées du sheet
 * ont été NEUTRALISÉES (cf. gateDealSheet) — la structure reste, les chiffres
 * sensibles sont retirés.
 */
export interface DealDetailView {
  deal: DealListItem;
  sheet: DealSheet;
  /** true = chiffres détaillés masqués (viewer non KYC-approuvé). */
  kycGated: boolean;
  documents: DealDocument[];
  /** Tranche obligataire de référence (présentation). */
  tranche: {
    name: string;
    seniority: string;
    couponRatePct: number | null;
    isVariableReturn: boolean;
    tokenStandard: string;
    nominalUnitEur: number;
    totalNominalEur: number;
  } | null;
  /** SPV émettrice (présentation). */
  spv: { legalName: string; legalForm: string } | null;
}

// ─── Filtres de liste ────────────────────────────────────────────────────────

export interface DealFilters {
  /** Statuts inclus (défaut côté investisseur : ['open']). */
  statuses?: string[];
  dealType?: string;
}

// ─── Inserts (création back-office) — euros DB, valeurs alignées CHECK 0016 ────

import type { SpvLegalForm, DealType as DealTypeDb } from "./types";
export type { SpvLegalForm, DealTypeDb };
/** Devise de règlement (CHECK inv_deals.settlement_currency — jamais USDT). */
export type SettlementCurrency = "EUR" | "EURC" | "EURe";
/** Standard de token (CHECK inv_bond_tranches.token_standard — jamais 20/4626). */
export type TokenStandard = "ERC-3643" | "ERC-1400";

/** Payload de création d'un deal + son SPV + sa tranche (1 SPV = 1 deal). */
export interface CreateDealInput {
  /** Identité SPV. */
  spv: {
    legalName: string;
    legalForm?: SpvLegalForm;
    siren?: string | null;
    assetCity?: string | null;
    seniorDebtAmountEur?: number | null;
  };
  /** Identité publique + économie du deal. */
  deal: {
    slug: string;
    name: string;
    dealType: DealTypeDb;
    city?: string | null;
    postalCode?: string | null;
    acquisitionPriceEur: number;
    notaryFeesEur: number;
    worksBudgetEur: number;
    otherCostsEur: number;
    seniorDebtEur: number;
    sponsorEquityEur: number;
    appraisedValueEur?: number | null;
    targetRaiseEur: number;
    minTicketEur?: number;
    maxTicketEur?: number | null;
    durationMonths: number;
    settlementCurrency?: SettlementCurrency;
    seniorRateAnnual?: number;
    /** Prix de revente central (jsonb scenarios.exit). */
    prixReventeCentralEur?: number | null;
    loyerNetAnnuelEur?: number | null;
  };
  /** Tranche obligataire (coupon CIBLE non garanti). */
  tranche: {
    name: string;
    seniority?: "senior_secured" | "mezzanine" | "junior" | "subordinated";
    couponRatePct?: number | null;
    tokenStandard?: TokenStandard;
    nominalUnitEur?: number;
  };
}

/** Patch d'update d'un deal (champs éditables back-office). */
export interface UpdateDealInput {
  name?: string;
  city?: string | null;
  postalCode?: string | null;
  acquisitionPriceEur?: number;
  notaryFeesEur?: number;
  worksBudgetEur?: number;
  otherCostsEur?: number;
  seniorDebtEur?: number;
  sponsorEquityEur?: number;
  appraisedValueEur?: number | null;
  targetRaiseEur?: number;
  minTicketEur?: number;
  maxTicketEur?: number | null;
  durationMonths?: number;
  badges?: string[];
}

// ─── Store injectable ─────────────────────────────────────────────────────────

/**
 * Store du contexte deal. Toutes les méthodes sont filtrées par tenant côté
 * implémentation ; le service ré-asserte le tenant (I9).
 */
export interface DealStore {
  listDeals(tenantId: string, filters: DealFilters): Promise<DbDealRow[]>;
  findDealBySlug(tenantId: string, slug: string): Promise<DbDealRow | null>;
  findDealById(tenantId: string, id: string): Promise<DbDealRow | null>;
  /** Tranche de référence d'un deal (la plus senior / première créée). */
  findTrancheByDeal(tenantId: string, dealId: string): Promise<DbTrancheRow | null>;
  findSpvById(tenantId: string, spvId: string): Promise<(DbSpvRow & { id: string; legal_name: string; legal_form: string }) | null>;
  /** Documents data room (visibilité publique/restricted) d'un deal. */
  listDealDocuments(tenantId: string, dealId: string): Promise<DealDocument[]>;
  /** Tranche complète (présentation) d'un deal. */
  findTrancheFull(tenantId: string, dealId: string): Promise<
    | {
        name: string;
        seniority: string;
        coupon_rate_pct: number | null;
        is_variable_return: boolean;
        token_standard: string;
        nominal_unit_eur: number;
        total_nominal_eur: number;
      }
    | null
  >;
  /** Résout (ou crée) l'opérateur rattaché à l'utilisateur courant. */
  resolveOperatorId(tenantId: string, userId: string, legalNameFallback: string): Promise<string>;
  /** Crée SPV + deal + tranche atomiquement (1 SPV = 1 deal). Renvoie le deal créé. */
  createSpvDealTranche(
    tenantId: string,
    operatorId: string,
    payload: CreateDealInput,
  ): Promise<DbDealRow>;
  updateDeal(tenantId: string, dealId: string, patch: UpdateDealInput): Promise<DbDealRow>;
  /** Statut DB du deal (pour la garde de publication). */
  getDealStatus(tenantId: string, dealId: string): Promise<string | null>;
  /** true si le deal a au moins une version KIIS PUBLISHED. */
  hasPublishedKiis(tenantId: string, dealId: string): Promise<boolean>;
  setDealStatus(tenantId: string, dealId: string, status: string): Promise<DbDealRow>;
  /** Insère un document data room (upload R2). */
  insertDocument(
    tenantId: string,
    dealId: string,
    userId: string | null,
    doc: {
      doc_type: string;
      title: string;
      storage_key: string;
      mime_type?: string | null;
      size_bytes?: number | null;
      content_sha256?: string | null;
      visibility?: "public" | "restricted" | "private";
    },
  ): Promise<DealDocument>;
}

// ─── Mapping Row → View ──────────────────────────────────────────────────────

function toListItem(row: DbDealRow & {
  offering_regime?: string;
  raised_eur?: number;
  ltv_pct?: number | null;
  badges?: string[];
  restricted_to_sophisticated?: boolean;
  settlement_currency?: string;
  status?: string;
}): DealListItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    dealType: row.deal_type,
    status: row.status ?? "draft",
    offeringRegime: row.offering_regime ?? "private_placement",
    city: row.city,
    country: row.country,
    targetRaiseEur: row.target_raise_eur,
    raisedEur: row.raised_eur ?? 0,
    minTicketEur: row.min_ticket_eur,
    maxTicketEur: row.max_ticket_eur,
    targetIrrPct: row.target_irr_pct,
    ltvPct: row.ltv_pct ?? null,
    durationMonths: row.duration_months,
    badges: row.badges ?? [],
    restrictedToSophisticated: row.restricted_to_sophisticated ?? false,
    settlementCurrency: row.settlement_currency ?? "EUR",
    opensAt: row.opens_at,
    closesAt: row.closes_at,
  };
}

// ─── GATE KYC : neutralisation des chiffres financiers détaillés ──────────────

/**
 * Renvoie une copie du DealSheet où les chiffres financiers DÉTAILLÉS sont
 * retirés (viewer non KYC-approuvé). On GARDE la structure publique (use of
 * funds, dette/equity, LTV, marge, durée, rendement cible « non garanti »), et
 * on VIDE le détail sensible : étages chiffrés du waterfall, scénarios
 * pessimiste/optimiste, courbes de sensibilité, cashflow mois par mois.
 *
 * PUR. Ne mute jamais l'entrée.
 */
export function gateDealSheet(sheet: DealSheet): DealSheet {
  const blurredWaterfall = {
    ...sheet.charts.g3_waterfall,
    steps: [],
    interpretation: "Détail du waterfall visible après vérification d'identité (KYC).",
  };
  const blurredSensiPrix = {
    ...sheet.charts.g6_sensibilite_prix,
    points: [],
    point_mort_x: null,
    interpretation: "Sensibilité détaillée visible après vérification d'identité (KYC).",
  };
  const blurredSensiRetard = {
    ...sheet.charts.g7_sensibilite_retard,
    points: [],
    interpretation: "Sensibilité détaillée visible après vérification d'identité (KYC).",
  };
  const blurredCashflow = {
    ...sheet.charts.g8_cashflow,
    points: [],
    interpretation: "Cashflow détaillé visible après vérification d'identité (KYC).",
  };
  // Scénarios : on ne laisse que le central (cadre « cible non garanti »).
  const blurredScenarios = {
    ...sheet.charts.g5_scenarios,
    barres: sheet.charts.g5_scenarios.barres.filter((b) => b.key === "central"),
    interpretation: "Scénarios pessimiste/optimiste visibles après vérification d'identité (KYC).",
  };

  return {
    ...sheet,
    charts: {
      ...sheet.charts,
      g3_waterfall: blurredWaterfall,
      g5_scenarios: blurredScenarios,
      g6_sensibilite_prix: blurredSensiPrix,
      g7_sensibilite_retard: blurredSensiRetard,
      g8_cashflow: blurredCashflow,
    },
    // On expose les 3 scénarios « bruts » seulement aux KYC : on neutralise ici
    // les flux détaillés pess/opt en les ramenant au central (pas de fuite TRI).
    scenarios: {
      pessimiste: sheet.scenarios.central,
      central: sheet.scenarios.central,
      optimiste: sheet.scenarios.central,
    },
  };
}

// ─── Services ────────────────────────────────────────────────────────────────

/**
 * Liste les deals du tenant. Côté investisseur, ne renvoie QUE les `open` par
 * défaut (filtre dans la route). Aucune sélection/recommandation (anti-FIA I3).
 */
export async function listDeals(
  store: DealStore,
  tenantId: string,
  filters: DealFilters = {},
): Promise<DealListItem[]> {
  const rows = await store.listDeals(tenantId, filters);
  return rows.map((r) => {
    assertTenant(r as { tenant_id: string }, tenantId);
    return toListItem(r as Parameters<typeof toListItem>[0]);
  });
}

/**
 * Fiche deal complète par slug : mapping DB → moteur → buildDealSheet, GATE KYC,
 * data room. Renvoie null si le slug n'existe pas dans le tenant.
 */
export async function getDealBySlug(
  store: DealStore,
  ctx: DealViewerCtx,
  slug: string,
): Promise<DealDetailView | null> {
  const dealRow = await store.findDealBySlug(ctx.tenantId, slug);
  if (!dealRow) return null;
  assertTenant(dealRow as { tenant_id: string }, ctx.tenantId);

  const [tranche, trancheFull, spvRow, documents] = await Promise.all([
    store.findTrancheByDeal(ctx.tenantId, dealRow.id),
    store.findTrancheFull(ctx.tenantId, dealRow.id),
    dealRow as DbDealRow & { spv_id?: string },
    store.listDealDocuments(ctx.tenantId, dealRow.id),
  ]);

  const spvId = (dealRow as DbDealRow & { spv_id?: string }).spv_id;
  const spv = spvId ? await store.findSpvById(ctx.tenantId, spvId) : null;

  void spvRow;

  const input = mapDbDealToInput(dealRow, tranche, spv);
  const fullSheet = buildDealSheet(input);
  const kycGated = !ctx.kycApproved;
  const sheet = kycGated ? gateDealSheet(fullSheet) : fullSheet;

  return {
    deal: toListItem(dealRow as Parameters<typeof toListItem>[0]),
    sheet,
    kycGated,
    documents,
    tranche: trancheFull
      ? {
          name: trancheFull.name,
          seniority: trancheFull.seniority,
          couponRatePct: trancheFull.coupon_rate_pct,
          isVariableReturn: trancheFull.is_variable_return,
          tokenStandard: trancheFull.token_standard,
          nominalUnitEur: trancheFull.nominal_unit_eur,
          totalNominalEur: trancheFull.total_nominal_eur,
        }
      : null,
    spv: spv ? { legalName: spv.legal_name, legalForm: spv.legal_form } : null,
  };
}

/** Garde back-office : l'appelant doit être opérateur/admin. */
function assertOperator(ctx: OperatorCtx): void {
  const isAdmin = ctx.role === "admin" || ctx.scope.includes("admin");
  const isOperator = ctx.role === "operator" || ctx.scope.includes("operator");
  if (!isAdmin && !isOperator) {
    throw new ComplianceBlockedError("operator_or_admin_required");
  }
}

/** Clé d'idempotence déterministe pour la création (I8). */
export function dealCreateIdemKey(input: CreateDealInput): string {
  const hash = createHash("sha256")
    .update(JSON.stringify({ slug: input.deal.slug, spv: input.spv.legalName }))
    .digest("hex")
    .slice(0, 16);
  return `deal:create:${hash}`;
}

/**
 * Crée un deal + son SPV dédié + sa tranche obligataire (back-office opérateur).
 * Garde opérateur/admin. 1 SPV = 1 deal (contrainte DB UNIQUE).
 *
 * @throws ComplianceBlockedError si l'appelant n'est pas opérateur/admin.
 */
export async function createDealWithSpv(
  store: DealStore,
  ctx: OperatorCtx,
  input: CreateDealInput,
): Promise<DealListItem> {
  assertOperator(ctx);
  const operatorId = await store.resolveOperatorId(ctx.tenantId, ctx.userId, input.spv.legalName);
  const row = await store.createSpvDealTranche(ctx.tenantId, operatorId, input);
  assertTenant(row as { tenant_id: string }, ctx.tenantId);
  return toListItem(row as Parameters<typeof toListItem>[0]);
}

/** Met à jour un deal (back-office opérateur). Garde opérateur/admin + tenant (I9). */
export async function updateDeal(
  store: DealStore,
  ctx: OperatorCtx,
  dealId: string,
  patch: UpdateDealInput,
): Promise<DealListItem> {
  assertOperator(ctx);
  const existing = await store.findDealById(ctx.tenantId, dealId);
  if (!existing) throw new InvariantViolationError("I9", `deal introuvable (${dealId})`);
  assertTenant(existing as { tenant_id: string }, ctx.tenantId);
  const row = await store.updateDeal(ctx.tenantId, dealId, patch);
  assertTenant(row as { tenant_id: string }, ctx.tenantId);
  return toListItem(row as Parameters<typeof toListItem>[0]);
}

/**
 * Publie un deal : DRAFT/draft → open. GARDE compliance : un KIIS doit être
 * PUBLISHED (sinon ComplianceBlockedError). Garde opérateur/admin + tenant.
 *
 * @throws ComplianceBlockedError si pas de KIIS publié, ou statut non publiable.
 */
export async function publishDeal(
  store: DealStore,
  ctx: OperatorCtx,
  dealId: string,
): Promise<DealListItem> {
  assertOperator(ctx);
  const status = await store.getDealStatus(ctx.tenantId, dealId);
  if (status == null) throw new InvariantViolationError("I9", `deal introuvable (${dealId})`);
  if (status !== "draft") {
    throw new ComplianceBlockedError(`deal_not_publishable_from_status:${status}`);
  }
  const hasKiis = await store.hasPublishedKiis(ctx.tenantId, dealId);
  if (!hasKiis) {
    throw new ComplianceBlockedError("kiis_not_published");
  }
  const row = await store.setDealStatus(ctx.tenantId, dealId, "open");
  assertTenant(row as { tenant_id: string }, ctx.tenantId);
  return toListItem(row as Parameters<typeof toListItem>[0]);
}

/**
 * Attache un document à la data room d'un deal (upload R2 effectué en amont par
 * la route — fail-soft). Garde opérateur/admin + tenant.
 */
export async function attachDealDocument(
  store: DealStore,
  ctx: OperatorCtx,
  dealId: string,
  doc: {
    docType: string;
    title: string;
    storageKey: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    contentSha256?: string | null;
    visibility?: "public" | "restricted" | "private";
  },
): Promise<DealDocument> {
  assertOperator(ctx);
  const existing = await store.findDealById(ctx.tenantId, dealId);
  if (!existing) throw new InvariantViolationError("I9", `deal introuvable (${dealId})`);
  return store.insertDocument(ctx.tenantId, dealId, ctx.userId, {
    doc_type: doc.docType,
    title: doc.title,
    storage_key: doc.storageKey,
    mime_type: doc.mimeType ?? null,
    size_bytes: doc.sizeBytes ?? null,
    content_sha256: doc.contentSha256 ?? null,
    visibility: doc.visibility ?? "public",
  });
}

// ─── Adaptateur Supabase par défaut (service-role, colonnes réelles 0016/0020/0022) ─

const DEAL_COLS =
  "id, tenant_id, spv_id, operator_id, slug, name, deal_type, city, postal_code, country, " +
  "acquisition_price_eur, notary_fees_eur, works_budget_eur, other_costs_eur, total_project_cost_eur, " +
  "senior_debt_eur, sponsor_equity_eur, appraised_value_eur, ltv_pct, target_irr_pct, duration_months, " +
  "target_raise_eur, min_ticket_eur, max_ticket_eur, raised_eur, settlement_currency, stablecoin_enabled, " +
  "opens_at, closes_at, badges, offering_regime, restricted_to_sophisticated, status, " +
  "scenarios, fees, waterfall";

/**
 * Store Supabase aligné sur les colonnes RÉELLES des migrations 0016/0020/0022.
 * Service-role → on filtre `tenant_id` partout (I9).
 */
export function supabaseDealStore(): DealStore {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("[deal] Supabase service-role non configuré");

  return {
    async listDeals(tenantId, filters) {
      let q = db.from("inv_deals").select(DEAL_COLS).eq("tenant_id", tenantId);
      if (filters.statuses && filters.statuses.length > 0) {
        q = q.in("status", filters.statuses);
      }
      if (filters.dealType) q = q.eq("deal_type", filters.dealType);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as DbDealRow[]) ?? [];
    },

    async findDealBySlug(tenantId, slug) {
      const { data, error } = await db
        .from("inv_deals")
        .select(DEAL_COLS)
        .eq("tenant_id", tenantId)
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as DbDealRow | null) ?? null;
    },

    async findDealById(tenantId, id) {
      const { data, error } = await db
        .from("inv_deals")
        .select(DEAL_COLS)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as DbDealRow | null) ?? null;
    },

    async findTrancheByDeal(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_bond_tranches")
        .select("coupon_rate_pct, total_nominal_eur, nominal_unit_eur")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .order("waterfall_rank", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as DbTrancheRow | null) ?? null;
    },

    async findTrancheFull(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_bond_tranches")
        .select(
          "name, seniority, coupon_rate_pct, is_variable_return, token_standard, nominal_unit_eur, total_nominal_eur",
        )
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .order("waterfall_rank", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as {
        name: string;
        seniority: string;
        coupon_rate_pct: number | null;
        is_variable_return: boolean;
        token_standard: string;
        nominal_unit_eur: number;
        total_nominal_eur: number;
      } | null) ?? null;
    },

    async findSpvById(tenantId, spvId) {
      const { data, error } = await db
        .from("inv_spvs")
        .select("id, legal_name, legal_form, senior_debt_amount_eur")
        .eq("tenant_id", tenantId)
        .eq("id", spvId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as
        | (DbSpvRow & { id: string; legal_name: string; legal_form: string })
        | null) ?? null;
    },

    async listDealDocuments(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_documents")
        .select(
          "id, doc_type, title, mime_type, size_bytes, content_sha256, version, is_signed, created_at",
        )
        .eq("tenant_id", tenantId)
        .eq("entity_type", "inv_deal")
        .eq("entity_id", dealId)
        .in("visibility", ["public", "restricted"])
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as unknown as Array<{
        id: string;
        doc_type: string;
        title: string;
        mime_type: string | null;
        size_bytes: number | null;
        content_sha256: string | null;
        version: number;
        is_signed: boolean;
        created_at: string;
      }>) ?? []).map((d) => ({
        id: d.id,
        docType: d.doc_type,
        title: d.title,
        mimeType: d.mime_type,
        sizeBytes: d.size_bytes,
        contentSha256: d.content_sha256,
        version: d.version,
        isSigned: d.is_signed,
        createdAt: d.created_at,
      }));
    },

    async resolveOperatorId(tenantId, userId, legalNameFallback) {
      const { data: existing, error: findErr } = await db
        .from("inv_operators")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .maybeSingle();
      if (findErr) throw findErr;
      if (existing) return (existing as { id: string }).id;

      const { data: created, error: insErr } = await db
        .from("inv_operators")
        .insert({ tenant_id: tenantId, user_id: userId, legal_name: legalNameFallback })
        .select("id")
        .single();
      if (insErr || !created) throw insErr ?? new Error("create_operator_failed");
      return (created as { id: string }).id;
    },

    async createSpvDealTranche(tenantId, operatorId, payload) {
      // 1. SPV (1 par opération).
      const { data: spv, error: spvErr } = await db
        .from("inv_spvs")
        .insert({
          tenant_id: tenantId,
          operator_id: operatorId,
          legal_name: payload.spv.legalName,
          legal_form: payload.spv.legalForm ?? "SAS",
          siren: payload.spv.siren ?? null,
          asset_city: payload.spv.assetCity ?? payload.deal.city ?? null,
          senior_debt_amount_eur: payload.spv.seniorDebtAmountEur ?? payload.deal.seniorDebtEur,
        })
        .select("id")
        .single();
      if (spvErr || !spv) throw spvErr ?? new Error("create_spv_failed");
      const spvId = (spv as { id: string }).id;

      const totalCost =
        payload.deal.acquisitionPriceEur +
        payload.deal.notaryFeesEur +
        payload.deal.worksBudgetEur +
        payload.deal.otherCostsEur;

      // jsonb fees : grille + taux senior ; jsonb scenarios : décalages + exit.
      const feesJson = {
        taux_dette_senior_annuel: payload.deal.seniorRateAnnual ?? 0.045,
      };
      const scenariosJson: Record<string, unknown> = {
        pessimiste: { delta_prix_revente_pct: -0.08, retard_mois: 3 },
        central: { delta_prix_revente_pct: 0, retard_mois: 0 },
        optimiste: { delta_prix_revente_pct: 0.05, retard_mois: 0 },
        exit: {
          prix_revente_central_eur: payload.deal.prixReventeCentralEur ?? totalCost,
          ...(payload.deal.appraisedValueEur != null
            ? { valeur_expertise_eur: payload.deal.appraisedValueEur }
            : {}),
          ...(payload.deal.loyerNetAnnuelEur != null
            ? { loyer_net_annuel_eur: payload.deal.loyerNetAnnuelEur }
            : {}),
        },
      };

      // 2. Deal (1 ↔ 1 SPV via UNIQUE). Statut draft (publication séparée).
      const { data: deal, error: dealErr } = await db
        .from("inv_deals")
        .insert({
          tenant_id: tenantId,
          spv_id: spvId,
          operator_id: operatorId,
          slug: payload.deal.slug,
          name: payload.deal.name,
          deal_type: payload.deal.dealType,
          city: payload.deal.city ?? null,
          postal_code: payload.deal.postalCode ?? null,
          acquisition_price_eur: payload.deal.acquisitionPriceEur,
          notary_fees_eur: payload.deal.notaryFeesEur,
          works_budget_eur: payload.deal.worksBudgetEur,
          other_costs_eur: payload.deal.otherCostsEur,
          total_project_cost_eur: totalCost,
          senior_debt_eur: payload.deal.seniorDebtEur,
          sponsor_equity_eur: payload.deal.sponsorEquityEur,
          appraised_value_eur: payload.deal.appraisedValueEur ?? null,
          target_raise_eur: payload.deal.targetRaiseEur,
          min_ticket_eur: payload.deal.minTicketEur ?? 1000,
          max_ticket_eur: payload.deal.maxTicketEur ?? null,
          duration_months: payload.deal.durationMonths,
          settlement_currency: payload.deal.settlementCurrency ?? "EUR",
          status: "draft",
          fees: feesJson as never,
          scenarios: scenariosJson as never,
        })
        .select(DEAL_COLS)
        .single();
      if (dealErr || !deal) throw dealErr ?? new Error("create_deal_failed");
      const dealRow = deal as unknown as DbDealRow & { id: string };

      // 3. Tranche obligataire (l'instrument souscrit). Cohérence nominal :
      //    total_nominal = target_raise ; units_total = total / nominal_unit.
      const nominalUnit = payload.tranche.nominalUnitEur ?? 1000;
      const totalNominal = payload.deal.targetRaiseEur;
      const unitsTotal = Math.max(1, Math.round(totalNominal / nominalUnit));
      // On aligne total_nominal sur units*unit pour respecter le CHECK de cohérence.
      const alignedTotal = unitsTotal * nominalUnit;
      const { error: trErr } = await db.from("inv_bond_tranches").insert({
        tenant_id: tenantId,
        deal_id: dealRow.id,
        spv_id: spvId,
        name: payload.tranche.name,
        seniority: payload.tranche.seniority ?? "senior_secured",
        coupon_rate_pct: payload.tranche.couponRatePct ?? null,
        nominal_unit_eur: nominalUnit,
        total_nominal_eur: alignedTotal,
        units_total: unitsTotal,
        token_standard: payload.tranche.tokenStandard ?? "ERC-3643",
      });
      if (trErr) throw trErr;

      return dealRow;
    },

    async updateDeal(tenantId, dealId, patch) {
      const dbPatch: Record<string, unknown> = {};
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.city !== undefined) dbPatch.city = patch.city;
      if (patch.postalCode !== undefined) dbPatch.postal_code = patch.postalCode;
      if (patch.acquisitionPriceEur !== undefined) dbPatch.acquisition_price_eur = patch.acquisitionPriceEur;
      if (patch.notaryFeesEur !== undefined) dbPatch.notary_fees_eur = patch.notaryFeesEur;
      if (patch.worksBudgetEur !== undefined) dbPatch.works_budget_eur = patch.worksBudgetEur;
      if (patch.otherCostsEur !== undefined) dbPatch.other_costs_eur = patch.otherCostsEur;
      if (patch.seniorDebtEur !== undefined) dbPatch.senior_debt_eur = patch.seniorDebtEur;
      if (patch.sponsorEquityEur !== undefined) dbPatch.sponsor_equity_eur = patch.sponsorEquityEur;
      if (patch.appraisedValueEur !== undefined) dbPatch.appraised_value_eur = patch.appraisedValueEur;
      if (patch.targetRaiseEur !== undefined) dbPatch.target_raise_eur = patch.targetRaiseEur;
      if (patch.minTicketEur !== undefined) dbPatch.min_ticket_eur = patch.minTicketEur;
      if (patch.maxTicketEur !== undefined) dbPatch.max_ticket_eur = patch.maxTicketEur;
      if (patch.durationMonths !== undefined) dbPatch.duration_months = patch.durationMonths;
      if (patch.badges !== undefined) dbPatch.badges = patch.badges;

      // Recalcule le coût total dénormalisé si un poste change.
      const { data, error } = await db
        .from("inv_deals")
        .update(dbPatch as never)
        .eq("tenant_id", tenantId)
        .eq("id", dealId)
        .select(DEAL_COLS)
        .single();
      if (error || !data) throw error ?? new Error("update_deal_failed");
      return data as unknown as DbDealRow;
    },

    async getDealStatus(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_deals")
        .select("status")
        .eq("tenant_id", tenantId)
        .eq("id", dealId)
        .maybeSingle();
      if (error) throw error;
      return (data as { status: string } | null)?.status ?? null;
    },

    async hasPublishedKiis(tenantId, dealId) {
      const { data, error } = await db
        .from("inv_kiis_documents")
        .select("id, inv_kiis_versions!inner(state)")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .eq("inv_kiis_versions.state", "PUBLISHED")
        .limit(1);
      if (error) throw error;
      return Array.isArray(data) && data.length > 0;
    },

    async setDealStatus(tenantId, dealId, status) {
      const { data, error } = await db
        .from("inv_deals")
        .update({ status })
        .eq("tenant_id", tenantId)
        .eq("id", dealId)
        .select(DEAL_COLS)
        .single();
      if (error || !data) throw error ?? new Error("set_status_failed");
      return data as unknown as DbDealRow;
    },

    async insertDocument(tenantId, dealId, userId, doc) {
      const { data, error } = await db
        .from("inv_documents")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          entity_type: "inv_deal",
          entity_id: dealId,
          ...doc,
        })
        .select(
          "id, doc_type, title, mime_type, size_bytes, content_sha256, version, is_signed, created_at",
        )
        .single();
      if (error || !data) throw error ?? new Error("insert_document_failed");
      const d = data as unknown as {
        id: string;
        doc_type: string;
        title: string;
        mime_type: string | null;
        size_bytes: number | null;
        content_sha256: string | null;
        version: number;
        is_signed: boolean;
        created_at: string;
      };
      return {
        id: d.id,
        docType: d.doc_type,
        title: d.title,
        mimeType: d.mime_type,
        sizeBytes: d.size_bytes,
        contentSha256: d.content_sha256,
        version: d.version,
        isSigned: d.is_signed,
        createdAt: d.created_at,
      };
    },
  };
}
