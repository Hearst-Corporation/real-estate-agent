/**
 * lib/invest/deal/kiis.ts — ② Deal & Offering : KIIS/DIS versionné (WF-1).
 *
 * Le KIIS (Key Investment Information Sheet, ECSP art. 23) est le document
 * d'information opposable. Il est VERSIONNÉ avec une machine à états et un HASH
 * du contenu FIGÉ à la publication (opposabilité — édition en place interdite).
 *
 * Tables (migration 0022) :
 *   - inv_kiis_documents : en-tête (1 par deal/type), pointe la version courante.
 *   - inv_kiis_versions  : versions, état DRAFT→…→PUBLISHED→SUPERSEDED, pdf_sha256.
 *
 * Transitions autorisées (sous-ensemble exploité au Jalon 1, alignées CHECK) :
 *   DRAFT → PUBLISHED   (publication directe : on fige le hash sha256 du contenu)
 *   PUBLISHED → SUPERSEDED (remplacée par une version ultérieure)
 *
 * À la publication d'une version n :
 *   1. pdf_sha256 = sha256(JSON canonique du contenu)  ← FIGÉ ;
 *   2. published_at = now ; state = PUBLISHED ;
 *   3. toute version PUBLISHED antérieure du même document → SUPERSEDED ;
 *   4. inv_kiis_documents.current_version = n.
 *
 * Store injectable (interface `KiisStore`) + adaptateur Supabase. PUR sauf l'I/O
 * du store ; le hash est calculé ici (crypto sha256), déterministe.
 */

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "../../server/supabase";
import { assertTenant } from "../shared/ownership";
import { ComplianceBlockedError, InvariantViolationError } from "../shared/errors";
import type { OperatorCtx } from "./service";

// ─── Vues domaine ─────────────────────────────────────────────────────────────

/** Type de document d'info (CHECK inv_kiis_documents.doc_type). */
export type KiisDocType = "KIIS" | "DIS";

/** État d'une version (CHECK inv_kiis_versions.state). */
export type KiisState =
  | "DRAFT"
  | "PENDING_COMPLIANCE_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "SUPERSEDED"
  | "ARCHIVED";

/** Vue d'une version KIIS. */
export interface KiisVersionView {
  id: string;
  documentId: string;
  docType: KiisDocType;
  version: number;
  state: KiisState;
  pdfSha256: string | null;
  publishedAt: string | null;
}

// ─── Store injectable ─────────────────────────────────────────────────────────

export interface KiisStore {
  /** Trouve/crée l'en-tête KIIS d'un deal pour un type. Renvoie {id, currentVersion}. */
  getOrCreateDocument(
    tenantId: string,
    dealId: string,
    docType: KiisDocType,
  ): Promise<{ id: string; currentVersion: number }>;
  /** Numéro de la dernière version (0 si aucune). */
  maxVersion(tenantId: string, documentId: string): Promise<number>;
  /** Crée une version DRAFT n. */
  insertVersion(
    tenantId: string,
    documentId: string,
    version: number,
    content: unknown,
  ): Promise<{ id: string }>;
  /** Lit une version (état + contenu pour calcul du hash). */
  findVersion(
    tenantId: string,
    versionId: string,
  ): Promise<{ id: string; document_id: string; version: number; state: string; content: unknown } | null>;
  /** Publie une version : fige pdf_sha256 + published_at + state=PUBLISHED. */
  setPublished(tenantId: string, versionId: string, pdfSha256: string): Promise<void>;
  /** Passe les autres versions PUBLISHED du document en SUPERSEDED. */
  supersedeOthers(tenantId: string, documentId: string, exceptVersionId: string): Promise<void>;
  /** Met à jour current_version de l'en-tête. */
  setCurrentVersion(tenantId: string, documentId: string, version: number): Promise<void>;
  /** Liste les versions d'un deal (toutes), pour le back-office. */
  listVersionsByDeal(tenantId: string, dealId: string): Promise<KiisVersionView[]>;
}

// ─── Hash du contenu (figé à la publication) ──────────────────────────────────

/** Sérialisation JSON déterministe (clés triées) — même convention qu'idempotency. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

/** sha256 (hex) du contenu KIIS — figé à la publication. PUR. */
export function hashKiisContent(content: unknown): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

// ─── Garde back-office ────────────────────────────────────────────────────────

function assertCompliance(ctx: OperatorCtx): void {
  const ok =
    ctx.role === "admin" ||
    ctx.role === "operator" ||
    ctx.role === "compliance" ||
    ctx.scope.includes("admin") ||
    ctx.scope.includes("operator");
  if (!ok) throw new ComplianceBlockedError("operator_or_admin_required");
}

// ─── Services ────────────────────────────────────────────────────────────────

/** Crée une nouvelle version DRAFT du KIIS d'un deal (incrémente le numéro). */
export async function createKiisDraft(
  store: KiisStore,
  ctx: OperatorCtx,
  dealId: string,
  input: { docType?: KiisDocType; content: unknown },
): Promise<KiisVersionView> {
  assertCompliance(ctx);
  const docType = input.docType ?? "KIIS";
  const doc = await store.getOrCreateDocument(ctx.tenantId, dealId, docType);
  const next = (await store.maxVersion(ctx.tenantId, doc.id)) + 1;
  const ins = await store.insertVersion(ctx.tenantId, doc.id, next, input.content);
  return {
    id: ins.id,
    documentId: doc.id,
    docType,
    version: next,
    state: "DRAFT",
    pdfSha256: null,
    publishedAt: null,
  };
}

/**
 * Publie une version KIIS : DRAFT/APPROVED → PUBLISHED. Fige le hash sha256 du
 * contenu, supersede les versions publiées antérieures, met à jour current_version.
 *
 * @throws ComplianceBlockedError si l'état courant n'autorise pas la publication.
 */
export async function publishKiisVersion(
  store: KiisStore,
  ctx: OperatorCtx,
  versionId: string,
): Promise<KiisVersionView> {
  assertCompliance(ctx);
  const v = await store.findVersion(ctx.tenantId, versionId);
  if (!v) throw new InvariantViolationError("I9", `version KIIS introuvable (${versionId})`);
  if (v.state !== "DRAFT" && v.state !== "APPROVED") {
    throw new ComplianceBlockedError(`kiis_not_publishable_from_state:${v.state}`);
  }
  const pdfSha256 = hashKiisContent(v.content);
  await store.setPublished(ctx.tenantId, versionId, pdfSha256);
  await store.supersedeOthers(ctx.tenantId, v.document_id, versionId);
  await store.setCurrentVersion(ctx.tenantId, v.document_id, v.version);
  return {
    id: v.id,
    documentId: v.document_id,
    docType: "KIIS",
    version: v.version,
    state: "PUBLISHED",
    pdfSha256,
    publishedAt: new Date().toISOString(),
  };
}

/** Liste les versions KIIS d'un deal (back-office). */
export async function listKiisVersions(
  store: KiisStore,
  ctx: OperatorCtx,
  dealId: string,
): Promise<KiisVersionView[]> {
  assertCompliance(ctx);
  return store.listVersionsByDeal(ctx.tenantId, dealId);
}

// ─── Adaptateur Supabase (service-role, colonnes réelles 0022) ────────────────

export function supabaseKiisStore(): KiisStore {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("[kiis] Supabase service-role non configuré");

  return {
    async getOrCreateDocument(tenantId, dealId, docType) {
      const { data: existing, error: findErr } = await db
        .from("inv_kiis_documents")
        .select("id, current_version")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId)
        .eq("doc_type", docType)
        .maybeSingle();
      if (findErr) throw findErr;
      if (existing) {
        const e = existing as { id: string; current_version: number };
        return { id: e.id, currentVersion: e.current_version };
      }
      const { data: created, error: insErr } = await db
        .from("inv_kiis_documents")
        .insert({ tenant_id: tenantId, deal_id: dealId, doc_type: docType })
        .select("id, current_version")
        .single();
      if (insErr || !created) throw insErr ?? new Error("create_kiis_document_failed");
      const c = created as { id: string; current_version: number };
      return { id: c.id, currentVersion: c.current_version };
    },

    async maxVersion(tenantId, documentId) {
      const { data, error } = await db
        .from("inv_kiis_versions")
        .select("version")
        .eq("tenant_id", tenantId)
        .eq("kiis_document_id", documentId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as { version: number } | null)?.version ?? 0;
    },

    async insertVersion(tenantId, documentId, version, content) {
      const { data, error } = await db
        .from("inv_kiis_versions")
        .insert({
          tenant_id: tenantId,
          kiis_document_id: documentId,
          version,
          state: "DRAFT",
          content: content as never,
        })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert_kiis_version_failed");
      return { id: (data as { id: string }).id };
    },

    async findVersion(tenantId, versionId) {
      const { data, error } = await db
        .from("inv_kiis_versions")
        .select("id, kiis_document_id, version, state, content")
        .eq("tenant_id", tenantId)
        .eq("id", versionId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const r = data as {
        id: string;
        kiis_document_id: string;
        version: number;
        state: string;
        content: unknown;
      };
      return {
        id: r.id,
        document_id: r.kiis_document_id,
        version: r.version,
        state: r.state,
        content: r.content,
      };
    },

    async setPublished(tenantId, versionId, pdfSha256) {
      const { error } = await db
        .from("inv_kiis_versions")
        .update({ state: "PUBLISHED", pdf_sha256: pdfSha256, published_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", versionId);
      if (error) throw error;
    },

    async supersedeOthers(tenantId, documentId, exceptVersionId) {
      const { error } = await db
        .from("inv_kiis_versions")
        .update({ state: "SUPERSEDED" })
        .eq("tenant_id", tenantId)
        .eq("kiis_document_id", documentId)
        .eq("state", "PUBLISHED")
        .neq("id", exceptVersionId);
      if (error) throw error;
    },

    async setCurrentVersion(tenantId, documentId, version) {
      const { error } = await db
        .from("inv_kiis_documents")
        .update({ current_version: version })
        .eq("tenant_id", tenantId)
        .eq("id", documentId);
      if (error) throw error;
    },

    async listVersionsByDeal(tenantId, dealId) {
      const { data: docs, error: docErr } = await db
        .from("inv_kiis_documents")
        .select("id, doc_type")
        .eq("tenant_id", tenantId)
        .eq("deal_id", dealId);
      if (docErr) throw docErr;
      const docList = (docs as Array<{ id: string; doc_type: string }>) ?? [];
      if (docList.length === 0) return [];
      const byId = new Map(docList.map((d) => [d.id, d.doc_type]));
      const { data: versions, error: verErr } = await db
        .from("inv_kiis_versions")
        .select("id, kiis_document_id, version, state, pdf_sha256, published_at")
        .eq("tenant_id", tenantId)
        .in(
          "kiis_document_id",
          docList.map((d) => d.id),
        )
        .order("version", { ascending: false });
      if (verErr) throw verErr;
      return ((versions as Array<{
        id: string;
        kiis_document_id: string;
        version: number;
        state: string;
        pdf_sha256: string | null;
        published_at: string | null;
      }>) ?? []).map((v) => {
        assertTenant({ tenant_id: tenantId }, tenantId);
        return {
          id: v.id,
          documentId: v.kiis_document_id,
          docType: (byId.get(v.kiis_document_id) ?? "KIIS") as KiisDocType,
          version: v.version,
          state: v.state as KiisState,
          pdfSha256: v.pdf_sha256,
          publishedAt: v.published_at,
        };
      });
    },
  };
}
