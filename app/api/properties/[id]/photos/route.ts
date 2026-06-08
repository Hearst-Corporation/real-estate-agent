import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { r2IsConfigured, putObject, publicUrl, deleteObject } from "@/lib/storage/r2";
import { rateLimit } from "@/lib/ratelimit";
import { isValidImageContent } from "@/lib/storage/magic-bytes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET /api/properties/[id]/photos ─────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { id } = await params;

  const { data, error } = await sb
    .from("property_photos")
    .select("id, storage_key, url, position, is_cover, created_at")
    .eq("property_id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

// ─── POST /api/properties/[id]/photos — upload une photo ─────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!r2IsConfigured()) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { id: propertyId } = await params;
  const tenantId = tenantOf(claims);

  // ── Rate-limit : 20 uploads / 60 s par user + propriété ──────────────────
  const withinLimit = await rateLimit(`photo:${claims.sub}:${propertyId}`, 20, 60);
  if (!withinLimit) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Vérifier que la propriété appartient à l'utilisateur
  const { data: prop } = await sb
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantId)
    .single();

  if (!prop) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  // Validation type MIME
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "invalid_file_type" }, { status: 400 });
  }

  // Limite 10 Mo
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  // Position = MAX(position)+1 (robuste aux suppressions intermédiaires, pas COUNT).
  const { data: last } = await sb
    .from("property_photos")
    .select("position")
    .eq("property_id", propertyId)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = last ? last.position + 1 : 0;
  const isCover = position === 0; // 1ère photo de la propriété = couverture

  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const uuid = crypto.randomUUID();
  const storageKey = `properties/${propertyId}/${uuid}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Validation magic-bytes : vérifie le contenu réel du fichier ───────────
  if (!isValidImageContent(buffer, file.type)) {
    return NextResponse.json({ error: "invalid_image_content" }, { status: 400 });
  }

  await putObject(storageKey, buffer, file.type);
  const photoUrl = publicUrl(storageKey);

  const { data, error } = await sb
    .from("property_photos")
    .insert({
      property_id: propertyId,
      user_id: claims.sub,
      tenant_id: tenantId,
      storage_key: storageKey,
      url: photoUrl,
      position,
      is_cover: isCover,
    })
    .select("id, url, position, is_cover")
    .single();

  if (error || !data) {
    // Compensation : l'insert DB a échoué → supprimer l'objet R2 pour éviter l'orphelin.
    try {
      await deleteObject(storageKey);
    } catch {
      // best-effort
    }
    return NextResponse.json({ error: "insert_failed", detail: error?.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, url: data.url, position: data.position, is_cover: data.is_cover }, { status: 201 });
}
