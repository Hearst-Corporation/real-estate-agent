import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { Eyebrow, Title, Sub, Card, Badge } from "@/components/cockpit/primitives";
import { LogoutButton } from "@/components/cockpit/LogoutButton";

export default async function ProfilePage() {
  const claims = await getSession();
  if (!claims) redirect("/auth/login");

  const issued = claims.iat ? new Date(claims.iat * 1000).toLocaleString("fr-FR") : "—";

  return (
    <>
      <Eyebrow>Compte</Eyebrow>
      <Title>Profil</Title>
      <Sub>Session active. Identité et périmètre d&apos;accès.</Sub>

      <Card title="Identité">
        <div style={{ display: "grid", gap: "10px" }}>
          <div><strong>Email</strong> · {claims.email ?? "—"}</div>
          <div><strong>User ID</strong> · <code>{claims.sub}</code></div>
          <div><strong>Tenant</strong> · <code>{claims.tenant_id}</code></div>
          <div><strong>Rôle</strong> · {claims.role}</div>
          <div><strong>Session émise</strong> · {issued}</div>
        </div>
      </Card>

      <Card title="Scopes">
        {(claims.scope ?? []).map((s) => (
          <Badge key={s}>{s}</Badge>
        ))}
      </Card>

      <Card title="Session">
        <div style={{ marginBottom: "12px" }}>Fermer la session sur cet appareil.</div>
        <LogoutButton variant="full" />
      </Card>
    </>
  );
}
