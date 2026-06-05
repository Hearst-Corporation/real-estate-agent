import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { CockpitShell } from "@/components/cockpit/CockpitShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Défense en profondeur (en plus du proxy) : pas de session → login.
  const claims = await getSession();
  if (!claims) redirect("/auth/login");

  return (
    <CockpitShell userEmail={claims.email ?? undefined} isAdmin={claims.role === "admin"}>
      {children}
    </CockpitShell>
  );
}
