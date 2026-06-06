import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import type { FieldStatusMap, PropertyData } from "@/lib/estimation/types";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  field: z.literal("type_bien"),
  value: z.enum(["appartement", "maison", "immeuble", "local_commercial", "terrain", "autre"]),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const userId = claims.sub;
  const tenant = tenantOf(claims);
  const estimation = await loadOwnedEstimation(sb, id, userId, tenant);
  if (!estimation) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const property = (estimation.property ?? {}) as PropertyData;
  const fieldStatus = (estimation.field_status ?? {}) as FieldStatusMap;
  const newProperty: PropertyData = { ...property, type_bien: parsed.data.value };
  const newFieldStatus: FieldStatusMap = { ...fieldStatus, type_bien: "answered" };

  const { error: updateError } = await sb
    .from("estimations")
    .update({
      property: newProperty as unknown as Json,
      field_status: newFieldStatus as unknown as Json,
      property_type: parsed.data.value,
      status: "interviewing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("tenant_id", tenant);

  if (updateError) {
    console.error("[quick-answer] estimation update failed", {
      estimationId: id,
      tenant,
      field: parsed.data.field,
      code: updateError.code,
    });
    return NextResponse.json({ error: "quick_answer_failed" }, { status: 500 });
  }

  await sb.from("estimation_messages").insert({
    estimation_id: id,
    tenant_id: tenant,
    user_id: userId,
    role: "user",
    content: parsed.data.value,
    tool_input: { [parsed.data.field]: parsed.data.value } as Json,
  });

  return NextResponse.json({
    property: newProperty,
    fieldStatus: newFieldStatus,
    block: 1,
    canGenerate: false,
  });
}
