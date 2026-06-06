/**
 * lib/invest/reporting/index.ts — ⑦ Reporting & IFU : amorce DB-backed (Epic 1.5).
 *
 * `generateDealReport` produit un rapport de suivi PAR DEAL (trimestriel / IFU) :
 *   - écrit une ligne `inv_reports` (type aligné CHECK 0021) avec un `payload`
 *     structuré (synthèse FACTUELLE du deal + distributions versées) ;
 *   - génère un document best-effort sur R2 (clé `inv-reports/{tenant}/{deal}/…`)
 *     en FAIL-SOFT — R2 absent → on persiste quand même le rapport sans document ;
 *   - quand le document est posé, on crée une ligne `inv_documents` (doc_type
 *     `report` / `tax_statement` pour l'IFU) et on lie `inv_reports.document_id`.
 *
 * RAPPEL ANTI-FIA (L2/I2) : le reporting est FACTUEL et PAR DEAL. Aucune valeur
 * consolidée, aucune NAV : on rapporte des montants de créances versées sur CE
 * deal, jamais une performance agrégée d'un portefeuille.
 *
 * Service-role → filtrage `tenant_id` (I9). Store INJECTABLE pour les tests.
 */

import { getSupabaseAdmin } from "../../server/supabase";
import { DEFAULT_TENANT_ID } from "../shared/types";
import { assertTenant } from "../shared/ownership";
import { InvariantViolationError } from "../shared/errors";
import { r2IsConfigured, putObject } from "../../storage/r2";
import type { ReportType } from "./../distribution/types";

/** Période couverte par un rapport (bornes ISO `YYYY-MM-DD`, optionnelles). */
export interface ReportPeriod {
  /** Genre : `reporting` (suivi trimestriel) ou `ifu` (déclaratif fiscal annuel). */
  kind: "reporting" | "ifu";
  start?: string | null;
  end?: string | null;
  /** Libellé humain (ex. "T2 2026"). */
  label?: string | null;
}

/** Contexte d'appel du reporting (acteur + tenant). */
export interface ReportingCtx {
  tenantId: string;
  actorUserId?: string | null;
}

/** Synthèse factuelle d'un deal injectée dans le payload du rapport. */
export interface DealReportSnapshot {
  dealId: string;
  dealName: string;
  dealStatus: string;
  /** Nb de distributions versées (toutes natures) sur le deal. */
  distributionsCount: number;
  /** Total brut versé aux obligataires sur le deal (somme des créances, PAS une NAV). */
  totalDistributedEur: number;
}

/** Résultat de génération d'un rapport. */
export interface GenerateReportResult {
  reportId: string;
  dealId: string;
  reportType: ReportType;
  /** true si un document a été déposé sur R2 (sinon fail-soft : rapport seul). */
  documentStored: boolean;
  documentId: string | null;
  storageKey: string | null;
}

/** Store injectable du reporting (colonnes RÉELLES 0021/0020). */
export interface ReportingStore {
  /** Synthèse factuelle du deal (nom, statut, distributions). Tenant-scopé. */
  loadDealSnapshot(tenantId: string, dealId: string): Promise<DealReportSnapshot | null>;
  /** Insère un document GED (R2). Renvoie l'id. Tenant-scopé. */
  insertReportDocument(
    tenantId: string,
    dealId: string,
    doc: { doc_type: "report" | "tax_statement"; title: string; storage_key: string; mime_type: string; size_bytes: number },
  ): Promise<{ id: string }>;
  /** Insère le rapport (inv_reports). Renvoie l'id. Tenant-scopé. */
  insertReport(
    tenantId: string,
    row: {
      deal_id: string;
      report_type: ReportType;
      period_start: string | null;
      period_end: string | null;
      title: string;
      payload: Record<string, unknown>;
      document_id: string | null;
      status: string;
    },
  ): Promise<{ id: string }>;
}

/**
 * Port de stockage objet (R2) injectable — permet de tester le fail-soft sans
 * dépendre des variables d'env. Défaut = helpers R2 réels (lib/storage/r2).
 */
export interface ReportStoragePort {
  isConfigured(): boolean;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
}

/** Adaptateur R2 par défaut (lib/storage/r2). */
function defaultStorage(): ReportStoragePort {
  return {
    isConfigured: r2IsConfigured,
    put: (key, body, contentType) => putObject(key, body, contentType),
  };
}

/** Mappe le genre de période → type DB `inv_reports.report_type`. */
function reportTypeOf(kind: ReportPeriod["kind"]): ReportType {
  return kind === "ifu" ? "ifu" : "quarterly_update";
}

/**
 * Génère un rapport de suivi (best-effort) pour un deal.
 *
 * Toujours écrit `inv_reports` ; tente un document R2 en fail-soft (R2 absent /
 * erreur réseau → rapport persisté sans document, jamais d'échec dur).
 *
 * @throws InvariantViolationError (deal introuvable / I9).
 */
export async function generateDealReport(
  _sb: ReturnType<typeof getSupabaseAdmin>,
  ctx: ReportingCtx,
  dealId: string,
  period: ReportPeriod,
  deps: { store?: ReportingStore; storage?: ReportStoragePort } = {},
): Promise<GenerateReportResult> {
  if (!ctx?.tenantId) ctx = { tenantId: DEFAULT_TENANT_ID, actorUserId: ctx?.actorUserId ?? null };
  if (!dealId) throw new InvariantViolationError("I2", "generateDealReport sans dealId");

  const store = deps.store ?? supabaseReportingStore();
  const storage = deps.storage ?? defaultStorage();
  const snapshot = await store.loadDealSnapshot(ctx.tenantId, dealId);
  if (!snapshot) throw new InvariantViolationError("I2", `deal introuvable (${dealId})`);

  const reportType = reportTypeOf(period.kind);
  const label = period.label ?? (period.kind === "ifu" ? "IFU annuel" : "Suivi périodique");
  const title = `${snapshot.dealName} — ${label}`;

  // Payload FACTUEL (par deal, jamais une valeur consolidée / NAV).
  const payload: Record<string, unknown> = {
    kind: period.kind,
    deal: {
      id: snapshot.dealId,
      name: snapshot.dealName,
      status: snapshot.dealStatus,
    },
    distributions: {
      count: snapshot.distributionsCount,
      // Somme des créances versées sur CE deal — un cumul de paiements, pas une
      // valorisation de marché ni une part de fonds (anti-FIA L2).
      totalDistributedEur: snapshot.totalDistributedEur,
    },
    generatedAt: new Date().toISOString(),
    disclaimer:
      "Suivi factuel par opération (1 SPV = 1 deal). Montants = créances versées, " +
      "non une valorisation consolidée. Distribution variable, non garantie.",
  };

  // Document best-effort R2 (fail-soft).
  let documentId: string | null = null;
  let storageKey: string | null = null;
  let documentStored = false;
  if (storage.isConfigured()) {
    try {
      const body = Buffer.from(JSON.stringify({ title, ...payload }, null, 2), "utf8");
      const key = `inv-reports/${ctx.tenantId}/${dealId}/${reportType}-${Date.now()}.json`;
      await storage.put(key, body, "application/json");
      const docType = period.kind === "ifu" ? "tax_statement" : "report";
      const doc = await store.insertReportDocument(ctx.tenantId, dealId, {
        doc_type: docType,
        title,
        storage_key: key,
        mime_type: "application/json",
        size_bytes: body.byteLength,
      });
      documentId = doc.id;
      storageKey = key;
      documentStored = true;
    } catch {
      // Fail-soft : un échec R2 / GED ne bloque pas la persistance du rapport.
      documentId = null;
      storageKey = null;
      documentStored = false;
    }
  }

  const report = await store.insertReport(ctx.tenantId, {
    deal_id: dealId,
    report_type: reportType,
    period_start: period.start ?? null,
    period_end: period.end ?? null,
    title,
    payload,
    document_id: documentId,
    status: "draft",
  });

  return { reportId: report.id, dealId, reportType, documentStored, documentId, storageKey };
}

// ─── Adaptateur Supabase par défaut (service-role, colonnes RÉELLES 0021/0020) ─

/**
 * Store Supabase aligné sur les colonnes RÉELLES :
 *   - inv_reports (0021) ; inv_documents (0020) ;
 *   - inv_deals (0016) + inv_distributions (0019) pour la synthèse factuelle.
 * Service-role → filtrage `tenant_id` partout (I9).
 */
export function supabaseReportingStore(): ReportingStore {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("[reporting] Supabase service-role non configuré");

  return {
    async loadDealSnapshot(tenantId, dealId) {
      const { data: deal, error } = await db
        .from("inv_deals")
        .select("id, tenant_id, name, status")
        .eq("tenant_id", tenantId)
        .eq("id", dealId)
        .maybeSingle();
      if (error) throw error;
      if (!deal) return null;
      const d = deal as { id: string; tenant_id: string; name: string; status: string };
      assertTenant(d as { tenant_id: string }, tenantId);

      const { data: dists, error: dErr } = await db
        .from("inv_distributions")
        .select("gross_amount_eur")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId);
      if (dErr) throw dErr;
      const rows = (dists as { gross_amount_eur: number }[] | null) ?? [];
      const totalDistributedEur = rows.reduce((s, r) => s + Number(r.gross_amount_eur || 0), 0);

      return {
        dealId: d.id,
        dealName: d.name,
        dealStatus: d.status,
        distributionsCount: rows.length,
        totalDistributedEur,
      };
    },

    async insertReportDocument(tenantId, dealId, doc) {
      const { data, error } = await db
        .from("inv_documents")
        .insert({
          tenant_id: tenantId,
          entity_type: "inv_deal",
          entity_id: dealId,
          doc_type: doc.doc_type,
          title: doc.title,
          storage_key: doc.storage_key,
          mime_type: doc.mime_type,
          size_bytes: doc.size_bytes,
          visibility: "restricted",
        })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert_report_document_failed");
      return { id: (data as { id: string }).id };
    },

    async insertReport(tenantId, row) {
      const { data, error } = await db
        .from("inv_reports")
        .insert({ tenant_id: tenantId, ...row, payload: row.payload as never })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert_report_failed");
      return { id: (data as { id: string }).id };
    },
  };
}
