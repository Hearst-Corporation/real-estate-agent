import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { CockpitShell } from "@/components/cockpit/CockpitShell";
import PostHogIdentify from "@/components/providers/PostHogIdentify";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Défense en profondeur (en plus du proxy) : pas de session → login.
  const claims = await getSession();
  if (!claims) redirect("/auth/login");

  return (
    <CockpitShell userEmail={claims.email ?? undefined}>
      <PostHogIdentify distinctId={claims.sub} />
      {children}
    </CockpitShell>
  );
}
