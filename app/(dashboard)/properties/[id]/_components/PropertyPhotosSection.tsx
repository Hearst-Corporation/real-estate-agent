import { getSupabaseAdmin } from "@/lib/server/supabase";
import { Card } from "@/components/cockpit/primitives";
import { PhotoGallery } from "./PhotoGallery";
import { PhotoUploader } from "./PhotoUploader";
import { UI } from "@/lib/ui-strings";

type PhotoRow = {
  id: string;
  url: string;
  position: number;
  is_cover: boolean;
};

interface Props {
  propertyId: string;
  userId: string;
  tenantId: string;
}

export async function PropertyPhotosSection({ propertyId, userId, tenantId }: Props) {
  const td = UI.properties.detail;
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as any;
  const { data } = (await sbAny
    .from("property_photos")
    .select("id, url, position, is_cover")
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: true })) as { data: PhotoRow[] | null };

  const photos = data ?? [];

  return (
    <Card title={td.cardPhotos}>
      <div>
        <PhotoGallery photos={photos} propertyId={propertyId} />
      </div>
      <div className="mt-3">
        <PhotoUploader propertyId={propertyId} />
      </div>
    </Card>
  );
}
