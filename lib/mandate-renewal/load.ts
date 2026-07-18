/**
 * lib/mandate-renewal/load.ts — Chargement GPU1 du renouvellement de mandat (server-only).
 * =======================================================================================
 *
 * Owner-check STRICT : le client service-role bypass RLS → chaque requête filtre
 * explicitement `user_id` + `tenant_id`. On lit les mandats proches de
 * l'expiration (fenêtre `RENEWAL_WINDOW_DAYS`, réutilise la logique radar), puis
 * pour un mandat donné on agrège son activité réelle (visites, CR de visite,
 * estimations du bien) et on calcule la proposition déterministe.
 *
 * Dégrade proprement : une table absente (visit_reports non migrée) donne un bloc
 * vide (état honnête), jamais un crash.
 */

import "server-only";
import type { Gpu1Client } from "@/lib/gpu1";
import { computeMandateExpiries, type MandateRow } from "@/lib/radar/signals";
import {
  RENEWAL_WINDOW_DAYS,
  RENEWAL_LIST_LIMIT,
  RENEWAL_ACTIVITY_LIMIT,
} from "@/config/mandate-renewal";
import {
  analyzeMandateRenewal,
  type MandateRenewalAnalysis,
  type MandateInput,
  type VisitInput,
  type VisitReportInput,
  type EstimationInput,
} from "@/lib/mandate-renewal/aggregate";

const MANDATE_COLUMNS =
  "id, reference, kind, status, property_id, asking_price, signed_at, expires_at";

export interface OwnerContact {
  leadId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface RenewalListItem {
  analysis: MandateRenewalAnalysis;
  propertyLabel: string;
  owner: OwnerContact;
}

/**
 * Liste des mandats proches de l'expiration, chacun avec son analyse complète.
 * Owner-check dur user_id + tenant_id sur chaque requête.
 */
export async function loadRenewalCandidates(
  db: Gpu1Client,
  userId: string,
  tenant: string,
  now: Date = new Date(),
): Promise<RenewalListItem[]> {
  // ── 1. Mandats du tenant/user (owner-check dur) ──────────────────────────
  const { data: mandateRows, error } = await db
    .from("mandates")
    .select(MANDATE_COLUMNS)
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .not("expires_at", "is", null)
    .order("expires_at", { ascending: true })
    .limit(RENEWAL_LIST_LIMIT * 3);

  if (error || !mandateRows) return [];

  // ── 2. Filtre "proche expiration" via la détection radar (réutilisée) ────
  const forRadar: MandateRow[] = mandateRows.map((m) => ({
    id: m.id,
    reference: m.reference,
    kind: m.kind,
    status: m.status,
    property_id: m.property_id,
    asking_price: m.asking_price,
    expires_at: m.expires_at,
  }));
  const expiries = computeMandateExpiries(forRadar, now).filter(
    (s) => s.jours_restants <= RENEWAL_WINDOW_DAYS,
  );
  const eligibleIds = new Set(expiries.map((e) => e.mandate_id));
  const eligible = mandateRows
    .filter((m) => eligibleIds.has(m.id))
    .slice(0, RENEWAL_LIST_LIMIT);

  // ── 3. Analyse détaillée par mandat ──────────────────────────────────────
  const items: RenewalListItem[] = [];
  for (const m of eligible) {
    const built = await analyzeOne(db, m as MandateInput, userId, tenant, now);
    if (built) items.push(built);
  }
  return items;
}

/**
 * Charge et analyse UN mandat possédé (par id). Retourne null si le mandat
 * n'existe pas / n'appartient pas à l'utilisateur.
 */
export async function loadRenewalForMandate(
  db: Gpu1Client,
  mandateId: string,
  userId: string,
  tenant: string,
  now: Date = new Date(),
): Promise<RenewalListItem | null> {
  const { data: mandate } = await db
    .from("mandates")
    .select(MANDATE_COLUMNS)
    .eq("id", mandateId)
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .maybeSingle();

  if (!mandate) return null;
  return analyzeOne(db, mandate as MandateInput, userId, tenant, now);
}

async function analyzeOne(
  db: Gpu1Client,
  mandate: MandateInput,
  userId: string,
  tenant: string,
  now: Date,
): Promise<RenewalListItem | null> {
  const propertyId = mandate.property_id;

  const [propertyLabel, owner, visits, estimations] = await Promise.all([
    loadPropertyLabel(db, propertyId, userId, tenant),
    loadOwner(db, propertyId, userId, tenant),
    loadVisits(db, propertyId, userId, tenant),
    loadEstimations(db, propertyId, userId, tenant),
  ]);

  const reports = await loadVisitReports(db, visits, tenant);

  const analysis = analyzeMandateRenewal({
    mandate,
    visits,
    reports,
    estimations,
    now,
  });

  return { analysis, propertyLabel, owner };
}

async function loadPropertyLabel(
  db: Gpu1Client,
  propertyId: string | null,
  userId: string,
  tenant: string,
): Promise<string> {
  if (!propertyId) return "Bien";
  const { data } = await db
    .from("properties")
    .select("title, address")
    .eq("id", propertyId)
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .maybeSingle();
  return data?.title ?? data?.address ?? "Bien";
}

/** Résout le propriétaire via la dernière estimation portant owner_lead_id. */
async function loadOwner(
  db: Gpu1Client,
  propertyId: string | null,
  userId: string,
  tenant: string,
): Promise<OwnerContact> {
  const none: OwnerContact = { leadId: null, name: null, email: null, phone: null };
  if (!propertyId) return none;

  const { data: est } = await db
    .from("estimations")
    .select("owner_lead_id, created_at")
    .eq("property_id", propertyId)
    .eq("tenant_id", tenant)
    .not("owner_lead_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const leadId = est?.owner_lead_id ?? null;
  if (!leadId) return none;

  const { data: lead } = await db
    .from("leads")
    .select("id, full_name, email, phone")
    .eq("id", leadId)
    .eq("tenant_id", tenant)
    .maybeSingle();

  if (!lead) return { leadId, name: null, email: null, phone: null };
  return {
    leadId: lead.id,
    name: lead.full_name ?? null,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
  };
}

async function loadVisits(
  db: Gpu1Client,
  propertyId: string | null,
  userId: string,
  tenant: string,
): Promise<VisitInput[]> {
  if (!propertyId) return [];
  const { data, error } = await db
    .from("visits")
    .select("id, status, scheduled_at, feedback, notes, created_at")
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .order("scheduled_at", { ascending: false })
    .limit(RENEWAL_ACTIVITY_LIMIT);
  if (error || !data) return [];
  return data as VisitInput[];
}

async function loadEstimations(
  db: Gpu1Client,
  propertyId: string | null,
  userId: string,
  tenant: string,
): Promise<EstimationInput[]> {
  if (!propertyId) return [];
  const { data, error } = await db
    .from("estimations")
    .select("id, market_value, recommended_price, valued_at, created_at")
    .eq("property_id", propertyId)
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: false })
    .limit(RENEWAL_ACTIVITY_LIMIT);
  if (error || !data) return [];
  return data as EstimationInput[];
}

/**
 * CR de visite structurés (table visit_reports, migration 0051). DÉGRADE en []
 * si la table est absente (non migrée) — le résumé retombe sur le texte libre.
 */
async function loadVisitReports(
  db: Gpu1Client,
  visits: VisitInput[],
  tenant: string,
): Promise<VisitReportInput[]> {
  if (visits.length === 0) return [];
  const visitIds = visits.map((v) => v.id);
  const client = db as unknown as {
    from: (name: string) => ReturnType<Gpu1Client["from"]>;
  };
  const { data, error } = await client
    .from("visit_reports")
    .select("visit_id, interest, outcome, positives, objections, price_discussed, reported_at")
    .in("visit_id", visitIds)
    .eq("tenant_id", tenant)
    .limit(RENEWAL_ACTIVITY_LIMIT);
  if (error || !data) return []; // table absente ou erreur → dégradation honnête
  return data as unknown as VisitReportInput[];
}
