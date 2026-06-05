/**
 * lib/invest/reporting/service.test.ts — ⑦ Reporting & IFU (Epic 1.5).
 *
 * Couvre : écriture inv_reports (type aligné CHECK 0021), fail-soft document
 * (R2 absent en test → rapport persisté SANS document), payload factuel par deal
 * (jamais une valeur consolidée), mapping IFU → report_type='ifu'.
 */

import { describe, it, expect, vi } from "vitest";
import { generateDealReport, type ReportingStore, type DealReportSnapshot, type ReportStoragePort } from "./index";

/** Storage non configuré (fail-soft → pas de document). */
const storageOff: ReportStoragePort = { isConfigured: () => false, put: vi.fn(async () => {}) };
/** Storage configuré OK (document déposé). */
const storageOk: ReportStoragePort = { isConfigured: () => true, put: vi.fn(async () => {}) };
/** Storage configuré mais qui throw (fail-soft → rapport sans document). */
const storageThrows: ReportStoragePort = {
  isConfigured: () => true,
  put: vi.fn(async () => {
    throw new Error("R2 500");
  }),
};

function memStore(snapshot: DealReportSnapshot | null): ReportingStore & {
  reports: { report_type: string; document_id: string | null; payload: Record<string, unknown>; title: string }[];
  docs: number;
} {
  const reports: { report_type: string; document_id: string | null; payload: Record<string, unknown>; title: string }[] = [];
  let docs = 0;
  let seq = 0;
  return {
    reports,
    get docs() {
      return docs;
    },
    async loadDealSnapshot() {
      return snapshot;
    },
    async insertReportDocument() {
      docs += 1;
      return { id: `doc-${docs}` };
    },
    async insertReport(_t, row) {
      const id = `report-${++seq}`;
      reports.push({ report_type: row.report_type, document_id: row.document_id, payload: row.payload, title: row.title });
      return { id };
    },
  };
}

const SNAPSHOT: DealReportSnapshot = {
  dealId: "deal-1",
  dealName: "Résidence Haussmann",
  dealStatus: "live",
  distributionsCount: 2,
  totalDistributedEur: 122_100,
};

describe("generateDealReport", () => {
  it("écrit un rapport trimestriel (quarterly_update) sans document quand R2 absent (fail-soft)", async () => {
    const store = memStore(SNAPSHOT);
    const res = await generateDealReport(null, { tenantId: "real-estate-agent" }, "deal-1", { kind: "reporting" }, { store, storage: storageOff });
    expect(res.reportType).toBe("quarterly_update");
    expect(res.documentStored).toBe(false);
    expect(res.documentId).toBeNull();
    expect(store.reports).toHaveLength(1);
    expect(store.reports[0].document_id).toBeNull();
  });

  it("dépose un document quand le stockage est configuré + lie inv_reports.document_id", async () => {
    const store = memStore(SNAPSHOT);
    const res = await generateDealReport(null, { tenantId: "real-estate-agent" }, "deal-1", { kind: "reporting" }, { store, storage: storageOk });
    expect(res.documentStored).toBe(true);
    expect(res.documentId).not.toBeNull();
    expect(store.reports[0].document_id).toBe(res.documentId);
  });

  it("fail-soft : stockage qui throw → rapport persisté SANS document (jamais d'échec dur)", async () => {
    const store = memStore(SNAPSHOT);
    const res = await generateDealReport(null, { tenantId: "real-estate-agent" }, "deal-1", { kind: "reporting" }, { store, storage: storageThrows });
    expect(res.documentStored).toBe(false);
    expect(res.documentId).toBeNull();
    expect(store.reports).toHaveLength(1);
  });

  it("IFU → report_type='ifu'", async () => {
    const store = memStore(SNAPSHOT);
    const res = await generateDealReport(null, { tenantId: "real-estate-agent" }, "deal-1", { kind: "ifu" }, { store, storage: storageOff });
    expect(res.reportType).toBe("ifu");
  });

  it("payload FACTUEL par deal (montant = créances versées, pas une valeur consolidée)", async () => {
    const store = memStore(SNAPSHOT);
    await generateDealReport(null, { tenantId: "real-estate-agent" }, "deal-1", { kind: "reporting" }, { store, storage: storageOff });
    const payload = store.reports[0].payload as {
      deal: { id: string };
      distributions: { count: number; totalDistributedEur: number };
    };
    expect(payload.deal.id).toBe("deal-1");
    expect(payload.distributions.count).toBe(2);
    expect(payload.distributions.totalDistributedEur).toBe(122_100);
  });

  it("rejette un deal introuvable", async () => {
    const store = memStore(null);
    await expect(
      generateDealReport(null, { tenantId: "real-estate-agent" }, "deal-x", { kind: "reporting" }, { store, storage: storageOff }),
    ).rejects.toThrow();
  });
});
