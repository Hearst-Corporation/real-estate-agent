import { notFound } from "next/navigation";
import { PageHeader, Card, PageStack } from "@/components/cockpit/primitives";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
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
  const columns: Column<{ name: string; ok: boolean }>[] = [
    { key: "name", header: "Fournisseur", render: (r) => r.name },
    {
      key: "status",
      header: "Statut",
      align: "right",
      render: (r) => (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
            r.ok
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
              : "border-white/10 bg-white/[0.06] text-slate-400"
          }`}
        >
          {r.ok ? t.configured : t.absent}
        </span>
      ),
    },
  ];

  return (
    <PageStack>
      <PageHeader
        kicker={t.eyebrow}
        title={t.title}
        kpis={[
          { label: t.estimations, value: String(counts.estimations) },
          { label: t.leads, value: String(counts.leads) },
          { label: t.leadsEnriched, value: String(counts.leadsEnriched) },
          { label: t.providersConfigured, value: `${configuredCount}/${providerEntries.length}` },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-3">
        <div className="flex flex-col gap-6 @4xl:col-span-2">
          {!sb && (
            <Card title={t.title} variant="chart">
              <p className="py-8 text-center text-sm text-slate-500">{t.degraded}</p>
            </Card>
          )}
          <Card title={t.providersTitle} variant="chart">
            <p className="py-8 text-center text-sm text-slate-500">
              Vue d&apos;ensemble des fournisseurs.
            </p>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card title={t.obsTitle} variant="dense">
            <p className="py-8 text-center text-sm text-slate-500">{t.obsBody}</p>
          </Card>
          <Card title={t.jobsTitle} variant="dense">
            <p className="py-8 text-center text-sm text-slate-500">{t.jobsPlaceholder}</p>
          </Card>
        </div>
      </div>

      <Card variant="dense">
        <DataTable columns={columns} rows={providerRows} emptyLabel="Aucun fournisseur" getKey={(r) => r.name} />
      </Card>
    </PageStack>
  );
}
