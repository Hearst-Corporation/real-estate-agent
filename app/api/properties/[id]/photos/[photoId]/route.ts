import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { deleteObject } from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── DELETE /api/properties/[id]/photos/[photoId] ────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const { id: propertyId, photoId } = await params;
  const tenantId = tenantOf(claims);

  // 1. Récupérer la photo (storage_key + is_cover) avant suppression.
  const { data: photo } = await sb
    .from("property_photos")
    .select("storage_key, is_cover")
    .eq("id", photoId)
    .eq("property_id", propertyId)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantId)
    .single();

  if (!photo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 2. Supprimer la ligne DB.
  const { error } = await sb
    .from("property_photos")
    .delete()
    .eq("id", photoId)
    .eq("property_id", propertyId)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("[photos] delete failed", { code: error.code });
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  // 3. Supprimer l'objet R2 (best-effort : ne pas faire échouer la requête si R2 rate).
  try {
    await deleteObject(photo.storage_key);
  } catch {
    // L'objet orphelin sera nettoyé hors-bande ; la ligne DB est déjà supprimée.
  }

  // 4. Si la photo supprimée était la couverture, promouvoir la 1ère restante.
  if (photo.is_cover) {
    const { data: next } = await sb
      .from("property_photos")
      .select("id")
      .eq("property_id", propertyId)
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (next) {
      await sb
        .from("property_photos")
        .update({ is_cover: true })
        .eq("id", next.id)
        .eq("user_id", claims.sub)
        .eq("tenant_id", tenantId);
    }
  }

  return NextResponse.json({ success: true });
}
