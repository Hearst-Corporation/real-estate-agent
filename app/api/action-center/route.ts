/**
 * app/api/action-center/route.ts — CENTRE D'ACTIONS QUOTIDIEN (W1).
 *
 * GET : agrège en UNE vue priorisée les actions CRM (dérivées), les opportunités
 * marché (radar) et les approbations HITL en attente, chacune SCORÉE de façon
 * déterministe et EXPLICABLE. Lecture seule, owner-scopée (user_id + tenant_id sur
 * chaque requête — le client admin bypasse RLS, filtrage explicite obligatoire).
 *
 * Sécurité : auth 401 AVANT tout accès DB ; DB absente → 503 ; erreurs génériques.
 * Vérité : chaque source dégrade en UNAVAILABLE honnête si son schéma n'est pas
 * déployé — jamais de fausse donnée, jamais de section fantôme.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { UI } from "@/lib/ui-strings";
import { buildActionCenter, type DeriveInput, type DeriveLabels } from "@/lib/actions/derive";
import {
  computePriceDrops,
  computeDormant,
  computeMandateExpiries,
  type AnnonceRow,
  type AnnonceVersionRow,
  type MandateRow as RadarMandateRow,
} from "@/lib/radar/signals";
import { RADAR_SECTION_LIMIT } from "@/config/radar";
import { listApprovals } from "@/lib/approvals/db";
import { aggregateDailyCenter, type PendingApprovalRow } from "@/lib/action-center/aggregate";
import { RADAR_LABELS, APPROVAL_LABELS } from "@/lib/action-center/labels";
import type { DailyCenterResponse, SourceStatus } from "@/lib/action-center/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Borne de lecture par table (évite toute liste non bornée). */
const FETCH_LIMIT = 200;

/** Codes PostgREST/Postgres signalant une table/colonne absente → dégradation. */
function isSchemaMissing(error: { code?: string } | null | undefined): boolean {
  const code = String(error?.code ?? "");
  return code === "42P01" || code === "42703";
}

/** Libellés de dérivation depuis UI.* (aucun texte en dur). */
function deriveLabels(): DeriveLabels {
  const c = UI.dashboard.center;
  return {
    staleFor: c.reasons.staleFor,
    visitWith: c.reasons.visitWith,
    today: c.groups.today,
    rdvOn: () => c.reasons.rdvOn,
    estimationResume: c.reasons.estimationResume,
    acquereurNoProposal: c.reasons.acquereurNoProposal,
    matchToReview: c.reasons.matchToReview,
    proprietaireToCall: c.reasons.proprietaireToCall,
    mandateDraft: c.reasons.mandateDraft,
    taskDue: c.reasons.taskDue,
    taskOverdue: c.reasons.taskOverdue,
    taskOpen: c.reasons.taskOpen,
    validationNeeded: c.reasons.validationNeeded,
    fallbackLead: c.fallback.lead,
    fallbackProperty: c.fallback.property,
    fallbackEstimation: c.fallback.estimation,
    fallbackMandate: c.fallback.mandate,
    fallbackCritere: c.fallback.critere,
  };
}

export async function GET() {
  // 1) Auth AVANT tout accès DB.
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const uid = claims.sub;
  const tid = tenantOf(claims);
  const now = new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tables 0049+ hors types générés
  const sbAny = db as any;

  // ─── Cœur : mêmes lectures owner-scopées que le dashboard ──────────────────
  // Le cœur est le SOCLE : une erreur DB (hors schéma manquant) renvoie 500 —
  // il n'y a pas de dégradation « partielle » du cœur, donc son statut est LIVE
  // dès qu'on atteint l'agrégation (sinon on a déjà répondu 500 plus haut).
  const coreStatus: SourceStatus = "live";
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

    // Une erreur DUERE (hors schéma manquant) sur le cœur = 500 générique.
    for (const r of [leadsRes, visitsRes, estimationsRes, mandatesRes]) {
      if (r.error && !isSchemaMissing(r.error)) {
        console.error("action_center_core_failed", { tid, error: r.error.message });
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    }

    derive.tasks = (tasksRes.data ?? []) as DeriveInput["tasks"];
    derive.leads = (leadsRes.data ?? []) as DeriveInput["leads"];
    derive.visits = (visitsRes.data ?? []) as unknown as DeriveInput["visits"];
    derive.estimations = (estimationsRes.data ?? []) as DeriveInput["estimations"];
    derive.mandates = (mandatesRes.data ?? []) as unknown as DeriveInput["mandates"];
    derive.criteres = (criteresRes.data ?? []) as DeriveInput["criteres"];
    derive.matchs = (matchsRes.data ?? []) as DeriveInput["matchs"];
  } catch (e) {
    console.error("action_center_core_block_failed", { tid, error: String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { items: coreItems } = buildActionCenter(derive, nowMs, deriveLabels());

  // ─── Radar : opportunités marché (dégrade en unavailable si schéma absent) ──
  let radarStatus: SourceStatus = "live";
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

    if (annErr) {
      radarStatus = "unavailable";
    } else {
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
  } catch (e) {
    // Signal marché est un ENRICHISSEMENT : on dégrade proprement, on ne casse pas.
    console.error("action_center_radar_failed", { tid, error: String(e) });
    radarStatus = "unavailable";
    radar = null;
  }

  // ─── Approbations HITL en attente (table 0045 non déployée → unavailable) ──
  let approvalsStatus: SourceStatus = "live";
  let approvals: PendingApprovalRow[] | null = null;
  const listed = await listApprovals(db, tid, "pending", FETCH_LIMIT);
  if (listed.ok) {
    approvals = listed.rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      created_at: r.created_at,
    }));
  } else {
    approvalsStatus = "unavailable";
    approvals = null;
  }

  // ─── Agrégation + scoring déterministe ─────────────────────────────────────
  const items = aggregateDailyCenter({
    coreItems,
    radar,
    approvals,
    nowMs,
    radarLabels: RADAR_LABELS,
    approvalLabels: APPROVAL_LABELS,
  });

  const body: DailyCenterResponse = {
    items,
    sources: { core: coreStatus, radar: radarStatus, approvals: approvalsStatus },
    total: items.length,
    computedAt: nowIso,
  };
  return NextResponse.json(body);
}
