import { notFound } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { buildAdminOverview } from "@/lib/admin/overview";
import { Heading, Subheading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Divider } from "@/components/ui/divider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <div className="flex flex-col gap-8 pb-12">
      {/* Page header */}
      <div className="flex flex-col gap-1 pb-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <Subheading className="text-accent-500 dark:text-accent-400">{t.eyebrow}</Subheading>
          <Heading>{t.title}</Heading>
          <Text className="mt-1">{t.sub}</Text>
        </div>
      </div>

      {/* Volumétrie */}
      <div>
        <Subheading level={2}>{t.countsTitle}</Subheading>
        <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((item) => (
            <div
              key={item.name}
              className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10"
            >
              <dt className="truncate text-sm/6 text-zinc-500 dark:text-zinc-400">{item.name}</dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                {item.stat}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {!sb && (
        <div className="flex items-center gap-3 rounded-xl border border-zinc-950/10 px-4 py-3 dark:border-white/10">
          <Badge color="amber">!</Badge>
          <Text>{t.degraded}</Text>
        </div>
      )}

      {/* Observabilité + Jobs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-950/10 p-5 dark:border-white/10">
          <Subheading level={3}>{t.obsTitle}</Subheading>
          <Text className="mt-2">{t.obsBody}</Text>
        </section>
        <section className="rounded-xl border border-zinc-950/10 p-5 dark:border-white/10">
          <Subheading level={3}>{t.jobsTitle}</Subheading>
          <Text className="mt-2">{t.jobsPlaceholder}</Text>
        </section>
      </div>

      <Divider />

      {/* Providers */}
      <div>
        <div className="mb-4">
          <Subheading level={2}>{t.providersTitle}</Subheading>
          <Text className="mt-1">Santé des fournisseurs configurés côté serveur.</Text>
        </div>
        <Table dense grid>
          <TableHead>
            <TableRow>
              <TableHeader>Fournisseur</TableHeader>
              <TableHeader className="text-right">Statut</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {providerRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-zinc-500">
                  Aucun fournisseur
                </TableCell>
              </TableRow>
            ) : (
              providerRows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium text-zinc-950 dark:text-white">
                    {r.name}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge color={r.ok ? "lime" : "zinc"}>
                      {r.ok ? t.configured : t.absent}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
