import Link from "next/link";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { PageHeader, PageStack, Card } from "@/components/cockpit/primitives";
import { MissionLauncher } from "@/components/missions/MissionLauncher";
import { UI } from "@/lib/ui-strings";
import { MISSIONS_PAGE_LIMIT } from "@/lib/ui/constants";

export const dynamic = "force-dynamic";

type MissionRow = { id: string; title: string; status: string; created_at: string };

export default async function MissionsPage() {
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let rows: MissionRow[] = [];
  if (claims && sb) {
    const { data } = await sb
      .from("missions")
      .select("id, title, status, created_at")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("created_at", { ascending: false })
      .limit(MISSIONS_PAGE_LIMIT);
    rows = (data ?? []) as MissionRow[];
  }

  return (
    <PageStack>
      <PageHeader
        kicker={UI.missions.kicker}
        title={UI.nav.missions}
        kpis={[{ label: UI.missions.total, value: String(rows.length) }]}
      />
      <Card title={UI.missions.launchTitle}>
        <MissionLauncher />
      </Card>
      <Card title={UI.missions.listTitle}>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{UI.missions.empty}</p>
        ) : (
          <div className="flex flex-col divide-y divide-white/5">
            {rows.map((m) => (
              <Link
                key={m.id}
                href={`/missions/${m.id}`}
                className="flex items-center justify-between gap-4 py-3 text-sm transition-colors hover:bg-white/[0.03]"
              >
                <span className="font-medium text-slate-100">{m.title}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {UI.missions.status[m.status] ?? m.status} · {m.created_at.slice(0, 10)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </PageStack>
  );
}
