import { notFound } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { buildAdminOverview } from "@/lib/admin/overview";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const t = UI.admin;

  // Garde stricte : tout role !== 'admin' (y compris undefined) → 404.
  // Le proxy ne vérifie que la validité du JWT, pas le rôle.
  const claims = await getSession();
  if (!claims || claims.role !== "admin") notFound();

  const sb = getSupabaseAdmin();
  const { providers, counts } = await buildAdminOverview(sb);
  const providerEntries = Object.entries(providers);
  const configuredCount = providerEntries.filter(([, ok]) => ok).length;

  const providerRows = providerEntries.map(([name, ok]) => ({ name, ok }));

  const stats = [
    { name: t.estimations, stat: String(counts.estimations) },
    { name: t.leads, stat: String(counts.leads) },
    { name: t.leadsEnriched, stat: String(counts.leadsEnriched) },
    { name: t.providersConfigured, stat: `${configuredCount}/${providerEntries.length}` },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Page header — headings__page-headings/01-with-actions (adapté sombre) */}
      <div className="flex flex-col gap-1 pb-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
            {t.eyebrow}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t.title}</h1>
          <p className="mt-1 text-sm text-slate-400">{t.sub}</p>
        </div>
      </div>

      {/* Volumétrie — data-display__stats/03-simple-in-cards (adapté sombre) */}
      <div>
        <h2 className="text-lg font-semibold text-slate-100">{t.countsTitle}</h2>
        <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((item) => (
            <div
              key={item.name}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 shadow-lg shadow-black/20 backdrop-blur-sm sm:p-6"
            >
              <dt className="truncate text-sm font-medium text-slate-400">{item.name}</dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-white">{item.stat}</dd>
            </div>
          ))}
        </dl>
      </div>

      {!sb && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {t.degraded}
        </div>
      )}

      {/* Observabilité + Jobs — layout__cards (adapté sombre) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-slate-100">{t.obsTitle}</h3>
          <p className="mt-2 text-sm text-slate-400">{t.obsBody}</p>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-slate-100">{t.jobsTitle}</h3>
          <p className="mt-2 text-sm text-slate-400">{t.jobsPlaceholder}</p>
        </section>
      </div>

      {/* Providers — lists__tables/02-simple-in-card (adapté sombre) */}
      <div className="flow-root">
        <div className="mb-4 sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h2 className="text-lg font-semibold text-slate-100">{t.providersTitle}</h2>
            <p className="mt-1 text-sm text-slate-400">
              Santé des fournisseurs configurés côté serveur.
            </p>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20 backdrop-blur-sm">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/[0.03]">
              <tr>
                <th
                  scope="col"
                  className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-slate-200 sm:pl-6"
                >
                  Fournisseur
                </th>
                <th
                  scope="col"
                  className="py-3.5 pr-4 pl-3 text-right text-sm font-semibold text-slate-200 sm:pr-6"
                >
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {providerRows.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-500">
                    Aucun fournisseur
                  </td>
                </tr>
              ) : (
                providerRows.map((r) => (
                  <tr key={r.name}>
                    <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-slate-100 sm:pl-6">
                      {r.name}
                    </td>
                    <td className="py-4 pr-4 pl-3 text-right text-sm whitespace-nowrap sm:pr-6">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                          r.ok
                            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                            : "border-white/10 bg-white/[0.06] text-slate-400"
                        }`}
                      >
                        {r.ok ? t.configured : t.absent}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
