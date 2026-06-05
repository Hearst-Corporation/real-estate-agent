/**
 * Données serveur (RSC) du domaine invest — branchées sur la DB via le service
 * `lib/invest/deal`. Si la DB est vide (aucun deal `open`) ou non configurée, on
 * RETOMBE sur les données de démonstration (`./demo`) — la page affiche alors un
 * Banner "données de démonstration".
 *
 * On appelle le service directement (pas de self-fetch HTTP) : c'est le pattern
 * RSC Next 16 idiomatique (aucun aller-retour réseau, pas de forwarding de
 * cookie à se soucier). Le filtrage tenant_id reste explicite (I9).
 */

import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import {
  supabaseDealStore,
  listDeals,
  getDealBySlug,
  type DealListItem,
  type DealDetailView,
  type DealViewerCtx,
} from "@/lib/invest/deal";
import { dealBadges, type DealCardData, type ProductBadge } from "@/components/invest";
import { getHoldings, supabaseLedgerStore, type Holding } from "@/lib/invest/ledger";
import { listPayoutsForUser, type Payout } from "@/lib/invest/distribution";
import {
  supabaseClosingStore,
  evaluateConditions,
  hasValidCloseApproval,
  type ConditionsSnapshot,
} from "@/lib/invest/closing";

/** Source des données affichées (pour le bandeau "démo"). */
export type DataSource = "db" | "demo";

/** Libellé FR du type d'opération (présentation badge). */
const TYPE_LABEL: Record<string, string> = {
  marchand_de_biens: "Marchand de biens",
  promotion: "Promotion",
  locatif: "Locatif",
  value_add: "Value-add",
  mixte: "Mixte",
};

/** Calcule J- depuis closes_at (null si pas de date). */
function joursRestants(closesAt: string | null): number | null {
  if (!closesAt) return null;
  const diff = new Date(closesAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

/**
 * Mappe un `DealListItem` (DB) → `DealCardData` (carte marketplace). Convertit
 * les pourcentages DB (0..100) en ratios (0..1) attendus par les primitives, et
 * dérive les badges factuels (type / rang / risque) via `dealBadges`.
 */
export function toDealCardData(item: DealListItem): DealCardData {
  const ltv = item.ltvPct != null ? item.ltvPct / 100 : 0;
  const risqueEleve = ltv > 0.7;
  return {
    slug: item.slug,
    nom: item.name,
    localisation: [item.city, item.country].filter(Boolean).join(", ") || "Localisation au closing/NDA",
    statusTone: "open",
    statusLabel: "Ouvert",
    joursRestants: joursRestants(item.closesAt),
    badges: dealBadges({
      typeLabel: TYPE_LABEL[item.dealType] ?? item.dealType,
      rangLabel: "Senior secured",
      risqueEleve,
    }),
    triCible: item.targetIrrPct != null ? item.targetIrrPct / 100 : null,
    ltv,
    dureeMois: item.durationMonths ?? 0,
    collecteEur: item.raisedEur,
    objectifEur: item.targetRaiseEur,
  };
}

/** Liste des deals ouverts (DB) + indicateur de source. */
export async function fetchOpenDeals(): Promise<{ source: DataSource; deals: DealListItem[] }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { source: "demo", deals: [] };
  try {
    const claims = await getSession();
    const tenantId = tenantOf(claims);
    const deals = await listDeals(supabaseDealStore(), tenantId, { statuses: ["open"] });
    if (deals.length === 0) return { source: "demo", deals: [] };
    return { source: "db", deals };
  } catch {
    // Fail-soft : toute erreur d'accès DB → bascule sur la démo (jamais d'écran blanc).
    return { source: "demo", deals: [] };
  }
}

/**
 * Liste TOUS les deals du tenant (tous statuts) pour le back-office opérateur.
 * Garde-fou : réservé aux opérateurs/admin (sinon renvoie une liste vide +
 * `authorized:false`). Aucune donnée de démo ici (vue de gestion réelle).
 */
export async function fetchOperatorDeals(): Promise<{
  authorized: boolean;
  configured: boolean;
  deals: DealListItem[];
}> {
  const sb = getSupabaseAdmin();
  if (!sb) return { authorized: false, configured: false, deals: [] };
  const claims = await getSession();
  if (!claims) return { authorized: false, configured: true, deals: [] };
  const isOperator =
    claims.role === "admin" ||
    claims.role === "operator" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("operator");
  if (!isOperator) return { authorized: false, configured: true, deals: [] };
  try {
    const tenantId = tenantOf(claims);
    const deals = await listDeals(supabaseDealStore(), tenantId, {});
    return { authorized: true, configured: true, deals };
  } catch {
    return { authorized: true, configured: true, deals: [] };
  }
}

/** Lit le statut KYC dénormalisé du viewer (gate des chiffres détaillés). */
async function viewerKycApproved(tenantId: string, userId: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  if (!sb) return false;
  const { data } = await sb
    .from("inv_investor_profiles")
    .select("kyc_status")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { kyc_status?: string } | null)?.kyc_status === "approved";
}

/**
 * Fiche deal par slug (DB) + gate KYC. Renvoie null si introuvable côté DB
 * (la page tentera alors le fallback démo).
 */
export async function fetchDealBySlug(slug: string): Promise<DealDetailView | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  try {
    const claims = await getSession();
    if (!claims) return null;
    const tenantId = tenantOf(claims);
    const kycApproved = await viewerKycApproved(tenantId, claims.sub);
    const ctx: DealViewerCtx = { userId: claims.sub, tenantId, kycApproved };
    return await getDealBySlug(supabaseDealStore(), ctx, slug);
  } catch {
    return null;
  }
}

// ─── CLOSING (Epic 1.4) : état de la saga DvP pour le back-office opérateur ────

/** Ligne de condition suspensive exposée à l'écran de closing. */
export interface ClosingConditionView {
  code: string;
  label: string;
  isMet: boolean;
  metAt: string | null;
}

/** Dernier run de réconciliation DEEP↔chaîne (vue écran). */
export interface ReconciliationRunView {
  result: string;
  triggeredPause: boolean;
  finishedAt: string | null;
}

/** État agrégé du closing d'un deal (RSC). */
export interface ClosingStateView {
  authorized: boolean;
  configured: boolean;
  found: boolean;
  dealId: string;
  dealName: string;
  dealSlug: string;
  dealStatus: string;
  /** Conditions suspensives + synthèse. */
  conditions: ClosingConditionView[];
  conditionsSnapshot: ConditionsSnapshot;
  /** Garde 4-eyes `deal_close` satisfaite ? */
  fourEyesApproved: boolean;
  /** Souscriptions financées (séquestre) en attente de closing. */
  fundedCount: number;
  /** Registre DEEP (holdings) en lecture (source de vérité). */
  holdings: Holding[];
  /** Dernière passe de réconciliation. */
  lastReconciliation: ReconciliationRunView | null;
}

const EMPTY_SNAPSHOT: ConditionsSnapshot = { allMet: false, unmet: [], total: 0 };

/**
 * Agrège l'état de closing d'un deal pour l'écran opérateur (RSC, lecture seule) :
 * conditions suspensives, garde 4-eyes, holdings DEEP (vérité), dernier run de
 * réconciliation. Garde back-office (operator/admin/compliance). Filtrage tenant (I9).
 */
export async function fetchClosingState(dealId: string): Promise<ClosingStateView> {
  const base: ClosingStateView = {
    authorized: false,
    configured: false,
    found: false,
    dealId,
    dealName: "",
    dealSlug: "",
    dealStatus: "",
    conditions: [],
    conditionsSnapshot: EMPTY_SNAPSHOT,
    fourEyesApproved: false,
    fundedCount: 0,
    holdings: [],
    lastReconciliation: null,
  };

  const sb = getSupabaseAdmin();
  if (!sb) return base;
  base.configured = true;

  const claims = await getSession();
  if (!claims) return base;
  const isOperator =
    claims.role === "admin" ||
    claims.role === "operator" ||
    claims.role === "compliance" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("operator");
  if (!isOperator) return base;
  base.authorized = true;

  try {
    const tenantId = tenantOf(claims);

    const { data: deal } = await sb
      .from("inv_deals")
      .select("id, name, slug, status")
      .eq("tenant_id", tenantId)
      .eq("id", dealId)
      .maybeSingle();
    if (!deal) return base;
    const d = deal as { id: string; name: string; slug: string; status: string };
    base.found = true;
    base.dealName = d.name;
    base.dealSlug = d.slug;
    base.dealStatus = d.status;

    const closingStore = supabaseClosingStore();
    const [condRows, approvals, funded, holdings] = await Promise.all([
      sb
        .from("inv_deal_closing_conditions")
        .select("code, label, is_met, met_at")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId),
      closingStore.listCloseApprovals(tenantId, dealId),
      closingStore.listFundedSubscriptions(tenantId, dealId),
      getHoldings(supabaseLedgerStore(), dealId, tenantId),
    ]);

    const rows =
      (condRows.data as { code: string; label: string; is_met: boolean; met_at: string | null }[] | null) ?? [];
    base.conditions = rows.map((c) => ({ code: c.code, label: c.label, isMet: c.is_met, metAt: c.met_at }));
    base.conditionsSnapshot = evaluateConditions(rows.map((c) => ({ code: c.code, is_met: c.is_met })));
    base.fourEyesApproved = hasValidCloseApproval(approvals);
    base.fundedCount = funded.length;
    base.holdings = holdings;

    const { data: run } = await sb
      .from("inv_reconciliation_runs")
      .select("result, triggered_pause, finished_at")
      .eq("tenant_id", tenantId)
      .eq("deal_id", dealId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (run) {
      const r = run as { result: string; triggered_pause: boolean; finished_at: string | null };
      base.lastReconciliation = { result: r.result, triggeredPause: r.triggered_pause, finishedAt: r.finished_at };
    }

    return base;
  } catch {
    return base;
  }
}

// ─── PORTEFEUILLE (Epic 1.5) : positions JUXTAPOSÉES par deal, branchées DB ────

/**
 * Une position du portefeuille, RATTACHÉE À UN DEAL précis. JAMAIS agrégée en une
 * valeur consolidée / NAV (anti-FIA L2) : on additionne des prêts (faits), pas une
 * valorisation de marché. Chaque position se dénoue à l'exit de SON opération.
 */
export interface PortfolioPositionView {
  dealId: string;
  dealSlug: string;
  dealName: string;
  localisation: string;
  /** Capital prêté = somme des souscriptions actives (allocated/minted) du deal. */
  capitalPreteEur: number;
  /** Units détenues (cap table DEEP, source de vérité). */
  units: number;
  /** Distributions reçues sur CE deal (somme des payouts versés). */
  distributionsRecuesEur: number;
  /** TRI cible (non garanti) issu du deal, ou null. */
  triCible: number | null;
  ltv: number | null;
  dureeMois: number;
  statutTone: "open" | "soon" | "late" | "closed";
  statutLabel: string;
  badges: ProductBadge[];
}

/** Portefeuille de l'investisseur courant (positions juxtaposées) + source. */
export interface PortfolioView {
  source: DataSource;
  positions: PortfolioPositionView[];
  /** Payouts reçus (détail coupons/exit), pour la liste « distributions reçues ». */
  payouts: Payout[];
}

/** Libellé/tone de statut d'une position depuis le statut DB du deal. */
function positionStatus(dealStatus: string): { tone: PortfolioPositionView["statutTone"]; label: string } {
  switch (dealStatus) {
    case "open":
      return { tone: "open", label: "Collecte en cours" };
    case "closing":
    case "live":
    case "distributing":
      return { tone: "open", label: "En cours" };
    case "closed":
    case "exited":
      return { tone: "closed", label: "Dénouée (exit)" };
    default:
      return { tone: "soon", label: "En cours" };
  }
}

/**
 * Portefeuille de l'investisseur courant, BRANCHÉ DB :
 *   - positions = souscriptions ACTIVES (allocated|minted) groupées PAR DEAL ;
 *   - units = cap table DEEP (holdings du porteur) ; capital = somme des montants ;
 *   - distributions reçues = payouts versés au porteur (par deal).
 *
 * JUXTAPOSITION stricte : aucune valeur consolidée / NAV. Si la DB est vide (aucune
 * position) ou non configurée → source `demo` (la page affiche un Banner + les
 * positions de démonstration). Filtrage tenant_id + user_id explicite (I9).
 */
export async function fetchMyPortfolio(): Promise<PortfolioView> {
  const sb = getSupabaseAdmin();
  if (!sb) return { source: "demo", positions: [], payouts: [] };

  try {
    const claims = await getSession();
    if (!claims) return { source: "demo", positions: [], payouts: [] };
    const tenantId = tenantOf(claims);
    const userId = claims.sub;

    // 1. Souscriptions ACTIVES du caller, par deal (capital prêté = montant alloué).
    const { data: subsData, error: subsErr } = await sb
      .from("inv_subscriptions")
      .select("deal_id, amount_eur, units, status")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .in("status", ["allocated", "minted"]);
    if (subsErr) throw subsErr;
    const subs = (subsData as { deal_id: string; amount_eur: number; units: number; status: string }[] | null) ?? [];
    if (subs.length === 0) return { source: "demo", positions: [], payouts: [] };

    // 2. Payouts reçus (par deal) + détail.
    const payouts = await listPayoutsForUser({ tenantId, userId });
    const payoutsByDeal = new Map<string, number>();
    for (const p of payouts) {
      payoutsByDeal.set(p.dealId, (payoutsByDeal.get(p.dealId) ?? 0) + p.netAmountEur);
    }

    // 3. Agrégation PAR DEAL (jamais cross-deal).
    const byDeal = new Map<string, { capitalPreteEur: number }>();
    for (const s of subs) {
      const cur = byDeal.get(s.deal_id) ?? { capitalPreteEur: 0 };
      cur.capitalPreteEur += Number(s.amount_eur || 0);
      byDeal.set(s.deal_id, cur);
    }

    const dealIds = Array.from(byDeal.keys());
    const { data: dealsData, error: dealsErr } = await sb
      .from("inv_deals")
      .select("id, slug, name, deal_type, city, country, target_irr_pct, ltv_pct, duration_months, status")
      .eq("tenant_id", tenantId)
      .in("id", dealIds);
    if (dealsErr) throw dealsErr;
    const dealRows =
      (dealsData as
        | {
            id: string;
            slug: string;
            name: string;
            deal_type: string;
            city: string | null;
            country: string;
            target_irr_pct: number | null;
            ltv_pct: number | null;
            duration_months: number | null;
            status: string;
          }[]
        | null) ?? [];
    const dealById = new Map(dealRows.map((d) => [d.id, d]));

    const positions: PortfolioPositionView[] = [];
    for (const dealId of dealIds) {
      const d = dealById.get(dealId);
      if (!d) continue;
      const agg = byDeal.get(dealId)!;
      // Units = solde DEEP du porteur sur ce deal (holdings filtrés sur l'user).
      const holdings = await getHoldings(supabaseLedgerStore(), dealId, tenantId);
      const units = holdings
        .filter((h) => h.walletAddress === userId)
        .reduce((s, h) => s + h.units, 0);
      const ltv = d.ltv_pct != null ? d.ltv_pct / 100 : null;
      const st = positionStatus(d.status);
      positions.push({
        dealId,
        dealSlug: d.slug,
        dealName: d.name,
        localisation: [d.city, d.country].filter(Boolean).join(", ") || "Localisation au closing/NDA",
        capitalPreteEur: agg.capitalPreteEur,
        units,
        distributionsRecuesEur: payoutsByDeal.get(dealId) ?? 0,
        triCible: d.target_irr_pct != null ? d.target_irr_pct / 100 : null,
        ltv,
        dureeMois: d.duration_months ?? 0,
        statutTone: st.tone,
        statutLabel: st.label,
        badges: dealBadges({
          typeLabel: TYPE_LABEL[d.deal_type] ?? d.deal_type,
          rangLabel: "Senior secured",
          risqueEleve: ltv != null && ltv > 0.7,
        }),
      });
    }

    if (positions.length === 0) return { source: "demo", positions: [], payouts: [] };
    return { source: "db", positions, payouts };
  } catch {
    // Fail-soft : toute erreur d'accès DB → bascule démo (jamais d'écran blanc).
    return { source: "demo", positions: [], payouts: [] };
  }
}
