/**
 * GET /api/invest/deals/{id}/documents/{docId}/download — délivre un lien de
 *   téléchargement pré-signé (SigV4, expirant) pour un document de data room
 *   d'un deal. Aucun binaire ne transite par le serveur : on renvoie une URL
 *   R2 signée que le client suit directement.
 *
 * Gardes :
 *   - 401 sans session.
 *   - 503 sans Supabase / sans stockage R2 configuré (fail-soft).
 *   - filtrage tenant_id explicite (I9) + entity_type='inv_deal' + entity_id={id}
 *     → un document d'un autre tenant ou d'un autre deal est invisible (404).
 *   - 404 si le document n'existe pas (dans ce tenant/deal).
 *   - 403 si visibility='private' SAUF si l'appelant en est le propriétaire
 *     (user_id === claims.sub).
 *
 * `{id}`    = UUID du deal.
 * `{docId}` = UUID du document (inv_documents.id).
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { presignedUrl, r2IsConfigured } from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Durée de validité du lien signé (secondes). */
const DEFAULT_DOWNLOAD_TTL_SECONDS = 3600;
const DOWNLOAD_TTL_SECONDS = Number(process.env.R2_DOWNLOAD_TTL_SECONDS ?? DEFAULT_DOWNLOAD_TTL_SECONDS);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;

  if (!UUID_RE.test(id) || !UUID_RE.test(docId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);

  // Service-role bypass RLS → on filtre tenant_id + deal + entity_type explicitement (I9).
  const { data, error } = await sb
    .from("inv_documents")
    .select("id, user_id, storage_key, visibility, status, title")
    .eq("tenant_id", tenantId)
    .eq("entity_type", "inv_deal")
    .eq("entity_id", id)
    .eq("id", docId)
    .maybeSingle();

  if (error) {
    console.error("[invest/download] query failed", error);
    return NextResponse.json({ error: "document_failed" }, { status: 500 });
  }
  if (!data || data.status !== "active") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const doc = data as {
    id: string;
    user_id: string | null;
    storage_key: string;
    visibility: "public" | "restricted" | "private";
    status: string;
    title: string | null;
  };

  // Document privé : réservé à son propriétaire (l'opérateur qui l'a déposé).
  if (doc.visibility === "private" && doc.user_id !== claims.sub) {
    return NextResponse.json({ error: "forbidden", detail: "private_document" }, { status: 403 });
  }

  // FAIL-SOFT : pas de stockage configuré → 503 (pas de lien à délivrer).
  if (!r2IsConfigured()) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }

  const url = await presignedUrl(doc.storage_key, DOWNLOAD_TTL_SECONDS);
  if (!url) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }

  return NextResponse.json({
    url,
    expiresAt: Date.now() + DOWNLOAD_TTL_SECONDS * 1000,
    title: doc.title,
  });
}
