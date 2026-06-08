import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { PageHeader, Card, Badge, PageStack } from "@/components/cockpit/primitives";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { LogoutButton } from "@/components/cockpit/LogoutButton";
import { IntegrationsPanel } from "./_components/IntegrationsPanel";
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

      <div className="ct-viz-row">
        <div>
          <Card title={t.identityTitle} variant="chart">
            <p className="ct-placeholder">Informations de session en cours.</p>
          </Card>
        </div>
        <div className="ct-stack-sm">
          <Card title={t.scopesTitle} variant="dense">
            {(claims.scope ?? []).map((s) => (
              <Badge key={s}>{s}</Badge>
            ))}
          </Card>

          <Card title={t.sessionTitle} variant="dense">
            <p className="ct-mb-sm">{t.sessionHint}</p>
            <LogoutButton variant="full" />
          </Card>

          {claims.role === "admin" && (
            <Card title={UI.nav.admin} variant="dense">
              <p className="ct-mb-sm">Console d&apos;administration : fournisseurs, observabilité, données tenant.</p>
              <Link href="/admin" className="ct-link-accent">
                {UI.nav.admin}
              </Link>
            </Card>
          )}
        </div>
      </div>

      <Card title={t.integrationsTitle} titleAs="section">
        <p className="ct-mb-sm">{t.integrationsHint}</p>
        <IntegrationsPanel />
      </Card>

      <Card variant="dense">
        <DataTable columns={columns} rows={identityRows} emptyLabel="Vide" getKey={(r) => r.key} />
      </Card>
    </PageStack>
  );
}
