/**
 * lib/estimation/continuity.ts — couche CONTINUITÉ de l'estimation.
 *
 * Fait de l'estimation le DÉBUT d'un parcours commercial :
 *   estimation → propriétaire (lead vendeur) → opportunité (mandat brouillon)
 *   → décision → prochaine action.
 *
 * Ne touche PAS au moteur de valorisation (`valuation.ts`). Ici : uniquement des
 * champs de suivi (0043) — owner_lead_id, decision, next_action, manual_adjustments.
 *
 * ⚠️ Les colonnes 0043 (owner_lead_id, decision, next_action, manual_adjustments)
 * ne sont PAS encore reflétées dans `database.types.ts` (types générés en retard).
 * On les lit/écrit via des casts NARROW au point de contact DB — les valeurs sont
 * validées par Zod dans les routes avant d'arriver ici. Aucune donnée inventée.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// ─── Enums (miroir des CHECK DB de la migration 0043) ───────────────────────────

export const DECISIONS = [
  "en_attente",
  "a_relancer",
  "mandat_signe",
  "refuse",
  "perdu",
] as const;
export type Decision = (typeof DECISIONS)[number];

/** Un ajustement SAISI À LA MAIN par l'agent (distinct des ajustements du moteur). */
export type ManualAdjustment = {
  id: string;
  label: string;
  /** Pourcentage signé (+/-) appliqué à la valeur. Exclusif avec `eur`. */
  pct: number | null;
  /** Montant en euros signé (+/-). Exclusif avec `pct`. */
  eur: number | null;
  raison: string;
  auteur: string;
  date: string;
};

/** Le propriétaire (lead vendeur) rattaché à l'estimation, forme légère pour l'UI. */
export type OwnerLead = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  kind: string;
};

/** L'opportunité de mandat (mandat au statut brouillon) née de l'estimation. */
export type MandateOpportunity = {
  id: string;
  status: string;
  reference: string | null;
  asking_price: number | null;
  property_id: string | null;
};

/** État complet de continuité d'une estimation (lu côté serveur, LIVE). */
export type ContinuityState = {
  ownerLeadId: string | null;
  owner: OwnerLead | null;
  decision: Decision | null;
  nextAction: string | null;
  manualAdjustments: ManualAdjustment[];
  propertyId: string | null;
  mandate: MandateOpportunity | null;
};

/** État de continuité vide (fallback UI quand rien n'est encore rattaché). */
export function emptyContinuity(): ContinuityState {
  return {
    ownerLeadId: null,
    owner: null,
    decision: null,
    nextAction: null,
    manualAdjustments: [],
    propertyId: null,
    mandate: null,
  };
}

// ─── Parsing défensif ───────────────────────────────────────────────────────────

/** Normalise un `manual_adjustments` jsonb (inconnu) en liste sûre. */
export function parseManualAdjustments(raw: unknown): ManualAdjustment[] {
  if (!Array.isArray(raw)) return [];
  const out: ManualAdjustment[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label : null;
    const raison = typeof r.raison === "string" ? r.raison : "";
    if (!label) continue;
    out.push({
      id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
      label,
      pct: typeof r.pct === "number" && Number.isFinite(r.pct) ? r.pct : null,
      eur: typeof r.eur === "number" && Number.isFinite(r.eur) ? r.eur : null,
      raison,
      auteur: typeof r.auteur === "string" ? r.auteur : "",
      date: typeof r.date === "string" ? r.date : new Date().toISOString(),
    });
  }
  return out;
}

function parseDecision(raw: unknown): Decision | null {
  return typeof raw === "string" && (DECISIONS as readonly string[]).includes(raw)
    ? (raw as Decision)
    : null;
}

// ─── Lecture ────────────────────────────────────────────────────────────────────

/**
 * Charge l'état de continuité d'une estimation possédée par user+tenant.
 * Joint le lead propriétaire et l'éventuelle opportunité de mandat.
 * Owner-check systématique (user_id + tenant_id) sur chaque requête.
 */
export async function loadContinuity(
  sb: SupabaseClient<Database>,
  estimationId: string,
  userId: string,
  tenant: string
): Promise<ContinuityState | null> {
  // Colonnes 0043 (owner_lead_id, decision, next_action, manual_adjustments)
  // absentes des types générés → select "*" puis lecture narrow via `unknown`.
  const { data, error } = await sb
    .from("estimations")
    .select("*")
    .eq("id", estimationId)
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    owner_lead_id: string | null;
    decision: unknown;
    next_action: string | null;
    manual_adjustments: unknown;
    property_id: string | null;
  };

  // Owner lead (si rattaché) — re-owner-check.
  let owner: OwnerLead | null = null;
  if (row.owner_lead_id) {
    const { data: leadRow } = await sb
      .from("leads")
      .select("id, full_name, email, phone, status, kind")
      .eq("id", row.owner_lead_id)
      .eq("user_id", userId)
      .eq("tenant_id", tenant)
      .maybeSingle();
    if (leadRow) owner = leadRow as OwnerLead;
  }

  // Opportunité de mandat (le mandat le plus récent sur le bien de l'estimation).
  let mandate: MandateOpportunity | null = null;
  if (row.property_id) {
    const { data: mRow } = await sb
      .from("mandates")
      .select("id, status, reference, asking_price, property_id")
      .eq("property_id", row.property_id)
      .eq("user_id", userId)
      .eq("tenant_id", tenant)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mRow) mandate = mRow as MandateOpportunity;
  }

  return {
    ownerLeadId: row.owner_lead_id,
    owner,
    decision: parseDecision(row.decision),
    nextAction: row.next_action,
    manualAdjustments: parseManualAdjustments(row.manual_adjustments),
    propertyId: row.property_id,
    mandate,
  };
}

// ─── Écriture (narrow cast au point de contact) ────────────────────────────────

/** Patch des colonnes 0043 de continuité. Retourne false sur erreur DB. */
export async function updateContinuityColumns(
  sb: SupabaseClient<Database>,
  estimationId: string,
  userId: string,
  tenant: string,
  patch: {
    owner_lead_id?: string | null;
    decision?: Decision | null;
    next_action?: string | null;
    manual_adjustments?: ManualAdjustment[];
  }
): Promise<boolean> {
  const payload: Record<string, unknown> = { ...patch };
  const { error } = await sb
    .from("estimations")
    // colonnes 0043 non typées → cast local scellé.
    .update(payload as never)
    .eq("id", estimationId)
    .eq("user_id", userId)
    .eq("tenant_id", tenant);
  return !error;
}
