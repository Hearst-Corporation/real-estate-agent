import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getMissionState } from "@/lib/missions/service";
import { tenantOf, uuidOwnerOf } from "@/lib/tenant";
import { MissionLive } from "@/components/missions/MissionLive";

export const dynamic = "force-dynamic";

export default async function MissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getSession();
  const sb = getSupabaseAdmin();
  if (!claims || !sb) redirect("/missions");

  const idn = { userId: claims.sub, tenant: tenantOf(claims), ownerId: uuidOwnerOf(claims) };
  const view = await getMissionState(sb, idn, id);
  if (!view) redirect("/missions");

  return <MissionLive initial={view} id={id} />;
}
