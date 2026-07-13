import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { LogoutButton } from "@/components/cockpit/LogoutButton";
import { IntegrationsPanel } from "./_components/IntegrationsPanel";
import { MfaPanel } from "./_components/MfaPanel";
import { UI } from "@/lib/ui-strings";
import { Heading, Subheading } from "@/components/ui/heading";
import { Text, Code } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Divider } from "@/components/ui/divider";
import {
  DescriptionList,
  DescriptionTerm,
  DescriptionDetails,
} from "@/components/ui/description-list";

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

  const scopes = claims.scope ?? [];

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Page header */}
      <div className="flex flex-col gap-1 pb-2">
        <Subheading className="text-accent-500 dark:text-accent-400">{t.eyebrow}</Subheading>
        <Heading>{t.title}</Heading>
        <Text className="mt-1">{t.sub}</Text>
      </div>

      <div className="grid grid-cols-1 gap-8 @4xl:grid-cols-3">
        {/* Identité */}
        <div className="@4xl:col-span-2">
          <Subheading level={3}>{t.identityTitle}</Subheading>
          <Text className="mt-1">Informations de session en cours.</Text>
          <Divider className="mt-4" />
          <DescriptionList>
            {identityRows.map((row) => (
              <div key={row.key} className="contents">
                <DescriptionTerm>{row.key}</DescriptionTerm>
                <DescriptionDetails>
                  <Code className="break-all">{row.value}</Code>
                </DescriptionDetails>
              </div>
            ))}
          </DescriptionList>
        </div>

        {/* Colonne latérale — scopes / session / admin */}
        <div className="flex flex-col gap-8">
          <section className="surface p-5">
            <Subheading level={3} className="font-titre">
              {t.scopesTitle}
            </Subheading>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {scopes.length === 0 ? (
                <Text>{t.empty}</Text>
              ) : (
                scopes.map((s) => (
                  <Badge key={s} color="zinc">
                    {s}
                  </Badge>
                ))
              )}
            </div>
          </section>

          <section className="surface p-5">
            <Subheading level={3} className="font-titre">
              {t.sessionTitle}
            </Subheading>
            <Text className="mt-2 mb-3">{t.sessionHint}</Text>
            <LogoutButton variant="full" />
          </section>

          {claims.role === "admin" && (
            <section className="surface p-5">
              <Subheading level={3} className="font-titre">
                {UI.nav.admin}
              </Subheading>
              <Text className="mt-2 mb-3">
                Console d&apos;administration : fournisseurs, observabilité, données tenant.
              </Text>
              <Button href="/admin" color="indigo">
                {UI.nav.admin}
              </Button>
            </section>
          )}
        </div>
      </div>

      <Divider />

      {/* 2FA — panneau métier intact */}
      <MfaPanel />

      <Divider />

      {/* Intégrations — panneau métier intact */}
      <section>
        <Subheading level={2}>{t.integrationsTitle}</Subheading>
        <Text className="mt-1 mb-4">{t.integrationsHint}</Text>
        <IntegrationsPanel />
      </section>
    </div>
  );
}
