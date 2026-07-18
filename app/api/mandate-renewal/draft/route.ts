/**
 * POST /api/mandate-renewal/draft
 *
 * Génère un BROUILLON propriétaire (status='draft') dans l'outbox pour un mandat
 * proche de l'expiration. AUCUN envoi ici — le brouillon reste DRAFT et ne part
 * qu'après validation humaine (HITL) via l'outbox.
 *
 * - 401 si non authentifié (avant tout accès DB)
 * - 400 si mandateId invalide
 * - 404 si le mandat n'existe pas / n'appartient pas à l'utilisateur
 * - 503 si DB non configurée OU si la table outbox_drafts est absente (UNAVAILABLE)
 *
 * Owner-check dur `user_id + tenant_id` sur chaque requête. Le brouillon est lié
 * au lead propriétaire (owner_lead_id) quand il est connu.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin, type Gpu1Client } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { rateLimit } from "@/lib/ratelimit";
import { isSchemaMissing } from "@/lib/outbox/types";
import { loadRenewalForMandate } from "@/lib/mandate-renewal/load";
import { generateOwnerDraft } from "@/lib/mandate-renewal/draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  mandateId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  if (!(await rateLimit(`mandate-renewal-draft:${userId}`, 20, 60))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = getGpu1Admin();
  if (!db) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  try {
    const item = await loadRenewalForMandate(db, parsed.data.mandateId, userId, tenant);
    if (!item) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { subject, body } = generateOwnerDraft(item.analysis, {
      propertyLabel: item.propertyLabel,
      ownerName: item.owner.name,
    });

    // Brouillon email owner-scopé, status='draft' — aucun envoi (HITL).
    const from = (db as unknown as { from: Gpu1Client["from"] }).from.bind(db);
    const { data, error } = await from("outbox_drafts" as never)
      .insert({
        id: crypto.randomUUID(),
        tenant_id: tenant,
        user_id: userId,
        lead_id: item.owner.leadId,
        channel: "email",
        subject,
        body,
        status: "draft",
      })
      .select(
        "id,lead_id,channel,subject,body,status,provider,provider_ref,error,created_at,updated_at,sent_at",
      )
      .single();

    if (error) {
      if (isSchemaMissing((error as { code?: string }).code)) {
        return NextResponse.json({ error: "outbox_unavailable" }, { status: 503 });
      }
      console.error("[mandate-renewal] draft create failed:", (error as { message?: string }).message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json(
      { draft: data, proposal: item.analysis.proposal },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
