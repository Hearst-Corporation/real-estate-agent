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
import { dealBadges, type DealCardData } from "@/components/invest";

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
