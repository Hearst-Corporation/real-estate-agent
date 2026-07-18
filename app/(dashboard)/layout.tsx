import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { CockpitShell } from "@/components/cockpit/CockpitShell";
import PostHogIdentify from "@/components/providers/PostHogIdentify";
import { ProductTourProvider, HelpPanelProvider } from "@/components/onboarding";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Défense en profondeur (en plus du proxy) : pas de session → login.
  const claims = await getSession();
  if (!claims) redirect("/auth/login");

  return (
    // Le provider de visite guidée enveloppe le shell : il doit pouvoir mettre en
    // évidence la navigation elle-même, et survivre aux changements de route.
    <ProductTourProvider>
      {/* L'aide a un point d'accès unique et permanent (entrée « Aide » du rail
          et de la barre mobile) : son état d'ouverture est partagé via ce
          contexte, consommé par la navigation et par le panneau. */}
      <HelpPanelProvider>
        <CockpitShell userEmail={claims.email ?? undefined}>
          <PostHogIdentify distinctId={claims.sub} />
          {children}
        </CockpitShell>
      </HelpPanelProvider>
    </ProductTourProvider>
  );
}
