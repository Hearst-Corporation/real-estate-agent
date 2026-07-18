/**
 * lib/assistant-ops/signals.ts — LECTURE owner-scopée des signaux de l'assistant (W9).
 *
 * Assemble, pour (user, tenant), les TROIS familles de signaux réels que
 * l'assistant analyse, en RÉUTILISANT les moteurs existants (jamais de
 * recalcul maison) :
 *   1. Cartes scorées du centre d'actions  → `buildActionCenter` + `aggregateDailyCenter`.
 *   2. Rapport de conversion (période courante) → `fetchConversionSources` + `computeConversion`.
 *   3. Prospects dormants → `detectDormant`.
 *
 * Owner-check APPLICATIF sur CHAQUE requête (le token service-role bypasse RLS →
 * filtrage explicite `user_id` + `tenant_id`). Toute liste est bornée. Chaque
 * source dégrade en `null` (SignalStatus=unavailable côté route) si son schéma
 * n'est pas déployé ou renvoie une erreur — jamais de fausse donnée.
 *
 * server-only, aucune interprétation métier ici (la priorisation vit dans propose.ts).
 */

import "server-only";

import type { getGpu1Admin } from "@/lib/gpu1";
import type { ScoredAction } from "@/lib/action-center/types";
import type { ConversionReport } from "@/lib/conversion/types";
import type { DormantProspect } from "@/lib/reactivation/types";

import { buildActionCenter, type DeriveInput, type DeriveLabels } from "@/lib/actions/derive";
import { aggregateDailyCenter, type PendingApprovalRow } from "@/lib/action-center/aggregate";
import { RADAR_LABELS, APPROVAL_LABELS } from "@/lib/action-center/labels";
import { listApprovals } from "@/lib/approvals/db";
import {
  computePriceDrops,
  computeDormant,
  computeMandateExpiries,
  type AnnonceRow,
  type AnnonceVersionRow,
  type MandateRow as RadarMandateRow,
} from "@/lib/radar/signals";
import { RADAR_SECTION_LIMIT } from "@/config/radar";

import { fetchConversionSources } from "@/lib/conversion/fetch";
import { computeConversion } from "@/lib/conversion/pipeline";
import { periodBounds } from "@/lib/conversion/period";

import {
  detectDormant,
  type LeadRow,
  type CritereRow,
  type MandateRow as ReactMandateRow,
  type VisitRow,
  type PropertyRow,
} from "@/lib/reactivation/detect";
import { DORMANT_THRESHOLD_DAYS } from "@/config/reactivation";

type Db = NonNullable<ReturnType<typeof getGpu1Admin>>;

/** Borne de lecture par table (aucune liste non bornée). */
const FETCH_LIMIT = 200;

/** Codes PostgREST/Postgres « relation/colonne absente » → dégradation propre. */
function isSchemaMissing(error: { code?: string } | null | undefined): boolean {
  const code = String(error?.code ?? "");
  return code === "42P01" || code === "42703";
}

export type AssistantSignals = {
  scored: ScoredAction[] | null;
  conversion: ConversionReport | null;
  dormant: DormantProspect[] | null;
};

// ─── 1) Cartes scorées du centre d'actions ───────────────────────────────────

async function fetchScored(
  db: Db,
  uid: string,
  tid: string,
  now: Date,
  deriveLabels: DeriveLabels,
): Promise<ScoredAction[] | null> {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tables prosp_*/rea_tasks hors types générés
  const sbAny = db as any;

  const derive: DeriveInput = {
    tasks: [],
    leads: [],
    visits: [],
    estimations: [],
    mandates: [],
    criteres: [],
    matchs: [],
  };

  try {
    const [tasksRes, leadsRes, visitsRes, estimationsRes, mandatesRes, criteresRes, matchsRes] =
      await Promise.all([
        sbAny
          .from("rea_tasks")
          .select(
            "id, entity_type, entity_id, kind, title, priority, due_at, status, snoozed_until, notes",
          )
          .eq("user_id", uid)
          .eq("tenant_id", tid)
          .in("status", ["open", "snoozed"])
          .limit(FETCH_LIMIT),
        db
          .from("leads")
          .select("id, full_name, kind, status, phone, updated_at")
          .eq("user_id", uid)
          .eq("tenant_id", tid)
          .order("updated_at", { ascending: true })
          .limit(FETCH_LIMIT),
        db
          .from("visits")
          .select(
            "id, scheduled_at, status, property_id, lead_id, properties(title, city), leads(full_name)",
          )
          .eq("user_id", uid)
          .eq("tenant_id", tid)
          .gte("scheduled_at", nowIso)
          .order("scheduled_at", { ascending: true })
          .limit(FETCH_LIMIT),
        db
          .from("estimations")
          .select("id, city, property_type, status, updated_at")
          .eq("user_id", uid)
          .eq("tenant_id", tid)
          .order("updated_at", { ascending: false })
          .limit(FETCH_LIMIT),
        db
          .from("mandates")
          .select("id, reference, status, expires_at, properties(title, city)")
          .eq("user_id", uid)
          .eq("tenant_id", tid)
          .eq("status", "brouillon")
          .limit(FETCH_LIMIT),
        sbAny
          .from("prosp_criteres_acquereur")
          .select("id, nom, lead_id, actif, updated_at")
          .eq("user_id", uid)
          .eq("tenant_id", tid)
          .eq("actif", true)
          .limit(FETCH_LIMIT),
        sbAny
          .from("prosp_matchs")
          .select("id, score_match, critere_id, created_at")
          .eq("user_id", uid)
          .eq("tenant_id", tid)
          .order("created_at", { ascending: false })
          .limit(FETCH_LIMIT),
      ]);

    // Une erreur DURE (hors schéma manquant) sur une source du cœur → indispo honnête.
    for (const r of [leadsRes, visitsRes, estimationsRes, mandatesRes]) {
      if (r.error && !isSchemaMissing(r.error)) return null;
    }

    derive.tasks = (tasksRes.data ?? []) as DeriveInput["tasks"];
    derive.leads = (leadsRes.data ?? []) as DeriveInput["leads"];
    derive.visits = (visitsRes.data ?? []) as unknown as DeriveInput["visits"];
    derive.estimations = (estimationsRes.data ?? []) as DeriveInput["estimations"];
    derive.mandates = (mandatesRes.data ?? []) as unknown as DeriveInput["mandates"];
    derive.criteres = (criteresRes.data ?? []) as DeriveInput["criteres"];
    derive.matchs = (matchsRes.data ?? []) as DeriveInput["matchs"];
  } catch {
    return null;
  }

  const { items: coreItems } = buildActionCenter(derive, nowMs, deriveLabels);

  // Radar (enrichissement) : dégrade sans casser.
  let radar: {
    priceDrops: ReturnType<typeof computePriceDrops>;
    dormant: ReturnType<typeof computeDormant>;
    mandateExpiries: ReturnType<typeof computeMandateExpiries>;
  } | null = null;
  try {
    const { data: annonces, error: annErr } = await db
      .from("prosp_annonces")
      .select("id,titre,ville,url,prix,actif,date_modif,date_publication,created_at")
      .eq("tenant_id", tid)
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (!annErr) {
      const rows = (annonces ?? []) as AnnonceRow[];
      const meta = new Map(rows.map((a) => [a.id, { titre: a.titre, ville: a.ville, url: a.url }]));
      const { data: versions, error: verErr } = await db
        .from("prosp_annonce_versions")
        .select("annonce_id,prix,observed_at")
        .eq("tenant_id", tid)
        .order("observed_at", { ascending: false })
        .limit(4000);
      const { data: mandates, error: manErr } = await db
        .from("mandates")
        .select("id,reference,kind,status,property_id,asking_price,expires_at")
        .eq("user_id", uid)
        .eq("tenant_id", tid)
        .not("expires_at", "is", null)
        .order("expires_at", { ascending: true })
        .limit(1000);
      radar = {
        priceDrops: verErr
          ? []
          : computePriceDrops((versions ?? []) as AnnonceVersionRow[], meta).slice(
              0,
              RADAR_SECTION_LIMIT,
            ),
        dormant: computeDormant(rows, now).slice(0, RADAR_SECTION_LIMIT),
        mandateExpiries: manErr
          ? []
          : computeMandateExpiries((mandates ?? []) as RadarMandateRow[], now).slice(
              0,
              RADAR_SECTION_LIMIT,
            ),
      };
    }
  } catch {
    radar = null;
  }

  // Approbations HITL en attente (table 0045 non déployée → simplement absentes).
  let approvals: PendingApprovalRow[] | null = null;
  const listed = await listApprovals(db, tid, "pending", FETCH_LIMIT);
  if (listed.ok) {
    approvals = listed.rows.map((r) => ({ id: r.id, channel: r.channel, created_at: r.created_at }));
  }

  return aggregateDailyCenter({
    coreItems,
    radar,
    approvals,
    nowMs,
    radarLabels: RADAR_LABELS,
    approvalLabels: APPROVAL_LABELS,
  });
}

// ─── 2) Rapport de conversion (période courante) ─────────────────────────────

async function fetchConversion(
  db: Db,
  uid: string,
  tid: string,
  now: Date,
): Promise<ConversionReport | null> {
  const { from, to } = periodBounds({ grain: "month", offset: 0 }, now);
  const sources = await fetchConversionSources(db, uid, tid, from, to);
  if (!sources) return null;
  return computeConversion(sources, { segment: "all", grain: "month", from, to });
}

// ─── 3) Prospects dormants ───────────────────────────────────────────────────

async function fetchDormant(
  db: Db,
  uid: string,
  tid: string,
  now: Date,
): Promise<DormantProspect[] | null> {
  try {
    // Mêmes lectures owner-scopées que /api/reactivation (mirroring exact des colonnes).
    const [leadsRes, mandatesRes, visitsRes, propsRes] = await Promise.all([
      db
        .from("leads")
        .select("id,full_name,email,phone,kind,status,updated_at,created_at")
        .eq("tenant_id", tid)
        .eq("user_id", uid)
        .order("updated_at", { ascending: true })
        .limit(FETCH_LIMIT),
      db
        .from("mandates")
        .select("id,reference,kind,status,property_id,asking_price,signed_at,updated_at,created_at")
        .eq("tenant_id", tid)
        .eq("user_id", uid)
        .limit(FETCH_LIMIT),
      db
        .from("visits")
        .select("lead_id,scheduled_at,updated_at")
        .eq("tenant_id", tid)
        .eq("user_id", uid)
        .limit(FETCH_LIMIT),
      db
        .from("properties")
        .select("id,title,city,postal_code,asking_price,property_type,surface,rooms,status")
        .eq("tenant_id", tid)
        .eq("user_id", uid)
        .limit(FETCH_LIMIT),
    ]);

    // Le socle (leads/properties/mandats/visites) doit répondre ; sinon indispo honnête.
    for (const r of [leadsRes, mandatesRes, visitsRes, propsRes]) {
      if (r.error && !isSchemaMissing(r.error)) return null;
    }

    // Critères acquéreur (table prospection — peut être absente, tolérée).
    const critRes = await db
      .from("prosp_criteres_acquereur")
      .select(
        "id,lead_id,nom,telephone,actif,type_bien,budget_min,budget_max,surface_min,surface_max,pieces_min,zones,updated_at,created_at",
      )
      .eq("tenant_id", tid)
      .eq("user_id", uid)
      .limit(FETCH_LIMIT);
    if (critRes.error && !isSchemaMissing(critRes.error)) return null;

    return detectDormant({
      leads: (leadsRes.data ?? []) as unknown as LeadRow[],
      criteres: (critRes.data ?? []) as unknown as CritereRow[],
      mandates: (mandatesRes.data ?? []) as unknown as ReactMandateRow[],
      visits: (visitsRes.data ?? []) as unknown as VisitRow[],
      messages: [],
      properties: (propsRes.data ?? []) as unknown as PropertyRow[],
      thresholdDays: DORMANT_THRESHOLD_DAYS,
      now,
    });
  } catch {
    return null;
  }
}

/**
 * Charge les trois familles de signaux en parallèle. Chaque source est
 * indépendante : l'échec de l'une (null) n'empêche PAS les autres de servir.
 */
export async function fetchAssistantSignals(
  db: Db,
  uid: string,
  tid: string,
  now: Date,
  deriveLabels: DeriveLabels,
): Promise<AssistantSignals> {
  const [scored, conversion, dormant] = await Promise.all([
    fetchScored(db, uid, tid, now, deriveLabels),
    fetchConversion(db, uid, tid, now),
    fetchDormant(db, uid, tid, now),
  ]);
  return { scored, conversion, dormant };
}
