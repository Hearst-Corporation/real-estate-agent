import Link from "next/link";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
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
    <div className="flex flex-col gap-6 pb-12">
      {/* Page heading — TW+ headings/01-with-actions (thème sombre) */}
      <div className="flex flex-col gap-4 pb-2">
        <div className="@lg:flex @lg:items-center @lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
              {UI.missions.kicker}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white @sm:truncate @sm:text-3xl">
              {UI.nav.missions}
            </h1>
          </div>
        </div>

        {/* KPI stats — TW+ data-display/stats (thème sombre) */}
        <dl className="grid grid-cols-1 gap-3 @sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {UI.missions.total}
            </dt>
            <dd className="mt-1 text-2xl font-bold text-white">{String(rows.length)}</dd>
          </div>
        </dl>
      </div>

      {/* Launcher métier — card TW+ layout__cards/03-card-with-header (thème sombre) */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">{UI.missions.launchTitle}</h2>
        </div>
        <div className="px-5 py-4">
          <MissionLauncher />
        </div>
      </section>

      {/* Liste — TW+ lists__stacked-lists/06-in-card-with-links (thème sombre) */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">{UI.missions.listTitle}</h2>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-slate-500">{UI.missions.empty}</p>
        ) : (
          <ul role="list" className="divide-y divide-white/5">
            {rows.map((m) => (
              <li key={m.id} className="relative">
                <Link
                  href={`/missions/${m.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{m.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {UI.missions.status[m.status] ?? m.status} · {m.created_at.slice(0, 10)}
                    </p>
                  </div>
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="size-5 flex-none text-slate-500"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
