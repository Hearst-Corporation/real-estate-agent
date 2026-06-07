/**
 * lib/invest/deal/kiis.test.ts — KIIS versionné (WF-1, Epic 1.2).
 *
 * Store EN MÉMOIRE. Vérifie :
 *   - createKiisDraft : incrémente le numéro de version, état DRAFT ;
 *   - publishKiisVersion : DRAFT→PUBLISHED, FIGE le hash sha256 du contenu,
 *     supersede les versions publiées antérieures, met à jour current_version ;
 *   - garde d'état : impossible de publier une version déjà PUBLISHED/SUPERSEDED ;
 *   - garde back-office (opérateur/admin/compliance) ;
 *   - hashKiisContent : déterminisme (clés triées).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createKiisDraft,
  publishKiisVersion,
  listKiisVersions,
  hashKiisContent,
  type KiisStore,
} from "./kiis";
import type { OperatorCtx } from "./service";
import { ComplianceBlockedError } from "../shared/errors";

interface MemDoc {
  id: string;
  tenant_id: string;
  deal_id: string;
  doc_type: string;
  current_version: number;
}
interface MemVer {
  id: string;
  tenant_id: string;
  document_id: string;
  version: number;
  state: string;
  content: unknown;
  pdf_sha256: string | null;
  published_at: string | null;
}

function memKiisStore() {
  const docsArr: MemDoc[] = [];
  const versArr: MemVer[] = [];
  let seq = 0;
  const id = (p: string) => `${p}_${++seq}`;

  const store: KiisStore & { _vers: MemVer[]; _docs: MemDoc[] } = {
    _vers: versArr,
    _docs: docsArr,
    async getOrCreateDocument(tenantId, dealId, docType) {
      let d = docsArr.find((x) => x.tenant_id === tenantId && x.deal_id === dealId && x.doc_type === docType);
      if (!d) {
        d = { id: id("doc"), tenant_id: tenantId, deal_id: dealId, doc_type: docType, current_version: 0 };
        docsArr.push(d);
      }
      return { id: d.id, currentVersion: d.current_version };
    },
    async maxVersion(tenantId, documentId) {
      const vs = versArr.filter((v) => v.tenant_id === tenantId && v.document_id === documentId);
      return vs.reduce((m, v) => Math.max(m, v.version), 0);
    },
    async insertVersion(tenantId, documentId, version, content) {
      const v: MemVer = {
        id: id("ver"),
        tenant_id: tenantId,
        document_id: documentId,
        version,
        state: "DRAFT",
        content,
        pdf_sha256: null,
        published_at: null,
      };
      versArr.push(v);
      return { id: v.id };
    },
    async findVersion(tenantId, versionId) {
      const v = versArr.find((x) => x.tenant_id === tenantId && x.id === versionId);
      return v ? { id: v.id, document_id: v.document_id, version: v.version, state: v.state, content: v.content } : null;
    },
    async setPublished(tenantId, versionId, pdfSha256) {
      const v = versArr.find((x) => x.tenant_id === tenantId && x.id === versionId);
      if (!v) throw new Error("not_found");
      v.state = "PUBLISHED";
      v.pdf_sha256 = pdfSha256;
      v.published_at = new Date().toISOString();
    },
    async supersedeOthers(tenantId, documentId, exceptVersionId) {
      for (const v of versArr) {
        if (v.tenant_id === tenantId && v.document_id === documentId && v.state === "PUBLISHED" && v.id !== exceptVersionId) {
          v.state = "SUPERSEDED";
        }
      }
    },
    async setCurrentVersion(tenantId, documentId, version) {
      const d = docsArr.find((x) => x.tenant_id === tenantId && x.id === documentId);
      if (d) d.current_version = version;
    },
    async listVersionsByDeal(tenantId, dealId) {
      const docIds = docsArr.filter((d) => d.tenant_id === tenantId && d.deal_id === dealId).map((d) => d.id);
      return versArr
        .filter((v) => docIds.includes(v.document_id))
        .map((v) => ({
          id: v.id,
          documentId: v.document_id,
          docType: "KIIS" as const,
          version: v.version,
          state: v.state as "DRAFT" | "PUBLISHED" | "SUPERSEDED",
          pdfSha256: v.pdf_sha256,
          publishedAt: v.published_at,
        }));
    },
  };
  return store;
}

const TENANT = "real-estate-agent";
const ctx: OperatorCtx = { userId: "op", tenantId: TENANT, role: "admin", scope: ["admin"] };
const DEAL = "deal-uuid-1";

describe("KIIS versionné", () => {
  let store: ReturnType<typeof memKiisStore>;
  beforeEach(() => {
    store = memKiisStore();
  });

  it("createKiisDraft : v1 puis v2 en DRAFT", async () => {
    const v1 = await createKiisDraft(store, ctx, DEAL, { content: { a: 1 } });
    expect(v1.version).toBe(1);
    expect(v1.state).toBe("DRAFT");
    const v2 = await createKiisDraft(store, ctx, DEAL, { content: { a: 2 } });
    expect(v2.version).toBe(2);
  });

  it("garde back-office : refuse un non opérateur/admin/compliance", async () => {
    await expect(
      createKiisDraft(store, { userId: "u", tenantId: TENANT, role: "user", scope: [] }, DEAL, { content: {} }),
    ).rejects.toBeInstanceOf(ComplianceBlockedError);
  });

  it("publishKiisVersion : DRAFT→PUBLISHED + hash figé + current_version", async () => {
    const v1 = await createKiisDraft(store, ctx, DEAL, { content: { sections: { a: "x" }, b: 2 } });
    const published = await publishKiisVersion(store, ctx, v1.id);
    expect(published.state).toBe("PUBLISHED");
    // Hash = sha256 du contenu (déterministe).
    expect(published.pdfSha256).toBe(hashKiisContent({ sections: { a: "x" }, b: 2 }));
    expect(published.publishedAt).not.toBeNull();
    // current_version mis à jour sur l'en-tête.
    expect(store._docs[0].current_version).toBe(1);
  });

  it("publier v2 supersede la v1 publiée", async () => {
    const v1 = await createKiisDraft(store, ctx, DEAL, { content: { v: 1 } });
    await publishKiisVersion(store, ctx, v1.id);
    const v2 = await createKiisDraft(store, ctx, DEAL, { content: { v: 2 } });
    await publishKiisVersion(store, ctx, v2.id);
    const states = store._vers.reduce<Record<number, string>>((m, v) => ((m[v.version] = v.state), m), {});
    expect(states[1]).toBe("SUPERSEDED");
    expect(states[2]).toBe("PUBLISHED");
    expect(store._docs[0].current_version).toBe(2);
  });

  it("refuse de publier une version déjà PUBLISHED (garde d'état)", async () => {
    const v1 = await createKiisDraft(store, ctx, DEAL, { content: {} });
    await publishKiisVersion(store, ctx, v1.id);
    await expect(publishKiisVersion(store, ctx, v1.id)).rejects.toBeInstanceOf(ComplianceBlockedError);
    await expect(publishKiisVersion(store, ctx, v1.id)).rejects.toThrow(/kiis_not_publishable_from_state/);
  });

  it("listKiisVersions renvoie les versions du deal", async () => {
    await createKiisDraft(store, ctx, DEAL, { content: {} });
    await createKiisDraft(store, ctx, DEAL, { content: {} });
    const list = await listKiisVersions(store, ctx, DEAL);
    expect(list).toHaveLength(2);
  });
});

describe("hashKiisContent", () => {
  it("déterministe quel que soit l'ordre des clés", () => {
    expect(hashKiisContent({ a: 1, b: 2 })).toBe(hashKiisContent({ b: 2, a: 1 }));
    expect(hashKiisContent({ a: 1 })).not.toBe(hashKiisContent({ a: 2 }));
  });

  it("renvoie un hex sha256 (64 caractères)", () => {
    expect(hashKiisContent({ x: 1 })).toMatch(/^[a-f0-9]{64}$/);
  });
});
