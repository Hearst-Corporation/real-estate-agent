import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { PageHeader, Card, Badge, PageStack } from "@/components/cockpit/primitives";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { LogoutButton } from "@/components/cockpit/LogoutButton";
import { IntegrationsPanel } from "./_components/IntegrationsPanel";
import { MfaPanel } from "./_components/MfaPanel";
import { UI } from "@/lib/ui-strings";

export default async function ProfilePage() {
  const claims = await getSession();
  if (!claims) redirect("/auth/login");

  const t = UI.profile;
  const issued = claims.iat ? new Date(claims.iat * 1000).toLocaleString("fr-FR") : t.empty;

  const identityRows = [
    { key: t.fields.email, value: claims.email ?? t.empty },
    { key: t.fields.userId, value: claims.sub },
    { key: t.fields.tenant, value: claims.tenant_id },
    { key: t.fields.role, value: claims.role },
    { key: t.fields.issued, value: issued },
  ];

  const columns: Column<{ key: string; value: string }>[] = [
    { key: "key", header: "Propriété", render: (r) => <strong>{r.key}</strong> },
    { key: "value", header: "Valeur", render: (r) => <code>{r.value}</code> },
  ];

  return (
    <PageStack>
      <PageHeader
        kicker={t.eyebrow}
        title={t.title}
      />

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-3">
        <div className="@4xl:col-span-2">
          <Card title={t.identityTitle} variant="chart">
            <p className="text-sm text-slate-400">Informations de session en cours.</p>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card title={t.scopesTitle} variant="dense">
            <div className="flex flex-wrap gap-1.5">
              {(claims.scope ?? []).map((s) => (
                <Badge key={s}>{s}</Badge>
              ))}
            </div>
          </Card>

          <Card title={t.sessionTitle} variant="dense">
            <p className="mb-3 text-sm text-slate-400">{t.sessionHint}</p>
            <LogoutButton variant="full" />
          </Card>

          {claims.role === "admin" && (
            <Card title={UI.nav.admin} variant="dense">
              <p className="mb-3 text-sm text-slate-400">Console d&apos;administration : fournisseurs, observabilité, données tenant.</p>
              <Link href="/admin" className="text-sm font-semibold text-indigo-300 hover:text-indigo-200">
                {UI.nav.admin}
              </Link>
            </Card>
          )}
        </div>
      </div>

      <MfaPanel />

      <Card title={t.integrationsTitle} titleAs="section">
        <p className="mb-3 text-sm text-slate-400">{t.integrationsHint}</p>
        <IntegrationsPanel />
      </Card>

      <Card variant="dense">
        <DataTable columns={columns} rows={identityRows} emptyLabel="Vide" getKey={(r) => r.key} />
      </Card>
    </PageStack>
  );
}
