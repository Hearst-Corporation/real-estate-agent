/**
 * GET /api/invest/compliance/audit — piste d'audit consolidée + intégrité (Epic 1.6).
 *
 * Renvoie les dernières entrées de `inv_audit_log` (piste UNIQUE, append-only +
 * hash-chaînée par tenant — 0020) dans l'ordre de la chaîne (`seq` croissant),
 * ET le résultat de la VÉRIFICATION D'INTÉGRITÉ de la chaîne de hash (I10) via
 * `verifyHashChain` (lib/invest/ledger) : toute insertion/suppression rétroactive
 * casse la continuité prev_hash → record_hash et fait passer `integrityOk=false`.
 *
 * GARDE compliance/auditor (lecture sensible) :
 *   - 401 sans session ; 503 sans Supabase ;
 *   - 403 si le caller n'est pas compliance/auditor/admin.
 * Filtrage `tenant_id` explicite (I9). Pagination par `limit` (défaut 200, max 1000)
 * et filtres optionnels `entityType` / `entityId` / `action`.
 *
 * NB : l'intégrité se vérifie sur la chaîne COMPLÈTE du tenant. Quand un filtre
 * (action/entité) est appliqué, on vérifie quand même la chaîne complète (sinon
 * un sous-ensemble paraîtrait « rompu ») et on expose la vue filtrée séparément.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { verifyHashChain } from "@/lib/invest/ledger";
import type { LedgerEntry } from "@/lib/invest/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/** Ligne d'audit lue (sous-ensemble inv_audit_log — colonnes RÉELLES 0020). */
interface AuditRow {
  id: string;
  tenant_id: string;
  seq: number;
  actor_user_id: string | null;
  actor_role: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_state: unknown;
  after_state: unknown;
  metadata: unknown;
  request_id: string | null;
  prev_hash: string | null;
  record_hash: string;
  created_at: string;
}

const AUDIT_COLS =
  "id, tenant_id, seq, actor_user_id, actor_role, action, entity_type, entity_id, " +
  "before_state, after_state, metadata, request_id, prev_hash, record_hash, created_at";

/**
 * Mappe une ligne d'audit vers la forme `LedgerEntry` attendue par `verifyHashChain`
 * (seuls `prevHash`/`entryHash` sont signifiants pour la continuité de chaîne).
 */
function toChainEntry(r: AuditRow): LedgerEntry {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    dealId: r.entity_id ?? "",
    entryType: "issuance",
    units: 0,
    nominalEur: 0,
    balanceUnitsAfter: 0,
    deepRegisterRef: null,
    reconciliationStatus: "legal_only",
    prevHash: r.prev_hash,
    entryHash: r.record_hash,
  };
}

export async function GET(req: NextRequest) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // Garde rôle : compliance / auditor / admin uniquement (lecture de la piste d'audit).
  const isAuditor =
    claims.role === "admin" ||
    claims.role === "compliance" ||
    claims.role === "auditor" ||
    claims.scope.includes("admin") ||
    claims.scope.includes("compliance") ||
    claims.scope.includes("auditor");
  if (!isAuditor) {
    return NextResponse.json(
      { error: "forbidden", detail: "compliance_or_auditor_required" },
      { status: 403 },
    );
  }

  const tenantId = tenantOf(claims);
  const url = req.nextUrl;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  const action = url.searchParams.get("action");

  try {
    // 1. Chaîne COMPLÈTE du tenant (ordre seq) → vérification d'intégrité (I10).
    //    On lit `seq, prev_hash, record_hash` seuls (léger) pour la vérif globale.
    const { data: chainData, error: chainErr } = await sb
      .from("inv_audit_log")
      .select("id, tenant_id, prev_hash, record_hash, seq")
      .eq("tenant_id", tenantId)
      .order("seq", { ascending: true });
    if (chainErr) throw chainErr;
    const chainRows = (chainData as unknown as AuditRow[]) ?? [];
    const integrityOk = verifyHashChain(chainRows.map(toChainEntry));

    // 2. Vue consolidée (dernières entrées, filtres optionnels) — ordre seq desc.
    let q = sb
      .from("inv_audit_log")
      .select(AUDIT_COLS)
      .eq("tenant_id", tenantId)
      .order("seq", { ascending: false })
      .limit(limit);
    if (entityType) q = q.eq("entity_type", entityType);
    if (entityId) q = q.eq("entity_id", entityId);
    if (action) q = q.eq("action", action);

    const { data, error } = await q;
    if (error) throw error;
    const entries = (data as unknown as AuditRow[]) ?? [];

    return NextResponse.json(
      {
        entries,
        integrityOk,
        total: chainRows.length,
        returned: entries.length,
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "audit_read_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
