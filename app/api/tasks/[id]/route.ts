/**
 * /api/tasks/[id] — mutation d'UNE tâche (rea_tasks) : traiter / reporter / rouvrir.
 *
 * PATCH { action: 'done' | 'snooze' | 'reopen', snoozed_until? }
 *   - done   → status='done'
 *   - snooze → status='snoozed' + snoozed_until (obligatoire, futur)
 *   - reopen → status='open', snoozed_until=null
 *
 * Sécurité : getSession() → 401 avant DB ; owner-check user_id + tenant_id sur la
 * cible (le service-role bypasse la RLS) ; Zod sur le body ; erreurs génériques.
 * DELETE : suppression owner-scopée (idempotente).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    action: z.enum(["done", "snooze", "reopen"]),
    snoozed_until: z.string().datetime({ offset: true }).optional(),
  })
  .refine((v) => v.action !== "snooze" || !!v.snoozed_until, {
    message: "snoozed_until requis pour snooze",
    path: ["snoozed_until"],
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

async function ownsTask(
  sb: AnyClient,
  id: string,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await sb
    .from("rea_tasks")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    console.error("[tasks] ownership check failed", { code: error.code });
    return false;
  }
  return Boolean(data);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin() as AnyClient;
  if (!sb) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const { id } = await ctx.params;
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const raw = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const userId = claims.sub;
  const tenantId = tenantOf(claims);

  // Owner-check AVANT toute écriture (le service-role bypasse la RLS).
  if (!(await ownsTask(sb, id, userId, tenantId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // snooze dans le passé = refusé (pas de report « déjà échu »).
  if (body.action === "snooze" && new Date(body.snoozed_until as string).getTime() <= Date.now()) {
    return NextResponse.json({ error: "snooze_in_past" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.action === "done") {
    patch.status = "done";
  } else if (body.action === "snooze") {
    patch.status = "snoozed";
    patch.snoozed_until = body.snoozed_until;
  } else {
    patch.status = "open";
    patch.snoozed_until = null;
  }

  const { data, error } = await sb
    .from("rea_tasks")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .select("id, status, snoozed_until")
    .single();

  if (error || !data) {
    console.error("[tasks] update failed", { code: error?.code });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  return NextResponse.json({ task: data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin() as AnyClient;
  if (!sb) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const { id } = await ctx.params;
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const userId = claims.sub;
  const tenantId = tenantOf(claims);

  const { error } = await sb
    .from("rea_tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("[tasks] delete failed", { code: error.code });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
