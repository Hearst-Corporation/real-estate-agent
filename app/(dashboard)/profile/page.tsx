import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { Eyebrow, Title, Sub, Card, Badge } from "@/components/cockpit/primitives";
import { LogoutButton } from "@/components/cockpit/LogoutButton";
import { UI } from "@/lib/ui-strings";

export default async function ProfilePage() {
  const claims = await getSession();
  if (!claims) redirect("/auth/login");

  const t = UI.profile;
  const issued = claims.iat ? new Date(claims.iat * 1000).toLocaleString("fr-FR") : t.empty;

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.title}</Title>
      <Sub>{t.sub}</Sub>

      <Card title={t.identityTitle}>
        <div className="ct-stack-sm">
          <div><strong>{t.fields.email}</strong> · {claims.email ?? t.empty}</div>
          <div><strong>{t.fields.userId}</strong> · <code>{claims.sub}</code></div>
          <div><strong>{t.fields.tenant}</strong> · <code>{claims.tenant_id}</code></div>
          <div><strong>{t.fields.role}</strong> · {claims.role}</div>
          <div><strong>{t.fields.issued}</strong> · {issued}</div>
        </div>
      </Card>

      <Card title={t.scopesTitle}>
        {(claims.scope ?? []).map((s) => (
          <Badge key={s}>{s}</Badge>
        ))}
      </Card>

      <Card title={t.sessionTitle}>
        <p className="ct-mb-sm">{t.sessionHint}</p>
        <LogoutButton variant="full" />
      </Card>
    </>
  );
}
