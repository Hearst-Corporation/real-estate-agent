/**
 * POST /api/invest/deals/{id}/documents — ajoute un document à la data room
 *   d'un deal (OPÉRATEUR/ADMIN). Upload fail-soft vers R2 → inv_documents.
 *
 * Body : multipart/form-data
 *   - file      : le binaire (obligatoire).
 *   - doc_type  : type GED (CHECK inv_documents.doc_type) ; défaut 'other'.
 *   - title     : titre affiché ; défaut = nom du fichier.
 *   - visibility: public|restricted|private ; défaut 'public' (visible investisseurs).
 *
 * Gardes :
 *   - 401 sans session ; 503 sans Supabase ; 403 si non opérateur/admin.
 *   - FAIL-SOFT R2 : si R2 non configuré → 503 { error: "storage_not_configured" }
 *     (aucune ligne inv_documents orpheline créée).
 *   - hash sha256 du contenu calculé serveur (intégrité, vérifiable au DL).
 *   - filtrage tenant_id explicite (I9).
 *
 * `{id}` = UUID du deal.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { putObject, r2IsConfigured } from "@/lib/storage/r2";
import { supabaseDealStore, attachDealDocument, type OperatorCtx } from "@/lib/invest/deal";
import { ComplianceBlockedError, InvariantViolationError } from "@/lib/invest/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Types GED autorisés (sous-ensemble du CHECK inv_documents.doc_type). */
const DOC_TYPES = new Set([
  "kiis",
  "dis",
  "prospectus",
  "bond_issuance_contract",
  "subscription_form",
  "intercreditor",
  "mortgage_deed",
  "appraisal",
  "works_quote",
  "bank_term_sheet",
  "kbis",
  "token_whitepaper",
  "tax_statement",
  "risk_disclosure",
  "tos",
  "report",
  "other",
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const isOperator =
    claims.role === "admin" ||
    claims.role === "operator" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("operator");
  if (!isOperator) {
    return NextResponse.json({ error: "forbidden", detail: "operator_or_admin_required" }, { status: 403 });
  }

  // FAIL-SOFT : pas de stockage configuré → 503 AVANT toute écriture DB.
  if (!r2IsConfigured()) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body", detail: "multipart/form-data attendu" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid_body", detail: "champ 'file' manquant" }, { status: 400 });
  }

  const docType = String(form.get("doc_type") ?? "other");
  if (!DOC_TYPES.has(docType)) {
    return NextResponse.json({ error: "invalid_body", detail: `doc_type invalide: ${docType}` }, { status: 400 });
  }
  const visibilityRaw = String(form.get("visibility") ?? "public");
  const visibility = (["public", "restricted", "private"] as const).includes(visibilityRaw as never)
    ? (visibilityRaw as "public" | "restricted" | "private")
    : "public";
  const title = String(form.get("title") ?? file.name ?? "Document");

  const tenantId = tenantOf(claims);
  const ctx: OperatorCtx = { userId: claims.sub, tenantId, role: claims.role, scope: claims.scope };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buf).digest("hex");
    const safeName = (file.name || "document").replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `invest/deals/${id}/documents/${Date.now()}_${safeName}`;

    // Upload R2 (throw si l'upload échoue → 502).
    await putObject(storageKey, buf, file.type || "application/octet-stream");

    const doc = await attachDealDocument(supabaseDealStore(), ctx, id, {
      docType,
      title,
      storageKey,
      mimeType: file.type || null,
      sizeBytes: buf.byteLength,
      contentSha256: sha256,
      visibility,
    });
    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (e) {
    if (e instanceof ComplianceBlockedError) {
      return NextResponse.json({ error: "forbidden", detail: e.reason }, { status: 403 });
    }
    if (e instanceof InvariantViolationError) {
      return NextResponse.json({ error: "not_found", detail: e.message }, { status: 404 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/R2/i.test(msg)) {
      return NextResponse.json({ error: "upload_failed", detail: msg }, { status: 502 });
    }
    return NextResponse.json({ error: "document_failed", detail: msg }, { status: 500 });
  }
}
