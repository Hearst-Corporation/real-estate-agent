"use client";

import type { ReactNode } from "react";
import { RailLeft } from "./RailLeft";
import { CenterPanel } from "./CenterPanel";
import { RailRight } from "./RailRight";
import { MobileAssistant } from "./MobileAssistant";
import { useRailRight } from "./useRailRight";
// Onboarding non intrusif (W6) : dock flottant, hors du flux du shell.
import { OnboardingLauncher } from "@/components/onboarding/OnboardingLauncher";

/**
 * Shell 3 colonnes calqué sur le bloc Tailwind Plus
 * `application-shells__multi-column/02-full-width-secondary-column-on-right` :
 * rail gauche + colonne secondaire droite en `fixed` (hors flux), le contenu
 * réserve leur place via `pl`/`pr` (une seule logique de largeur, pas de double
 * comptage flex + padding).
 */
export function CockpitShell({
  children,
  userEmail,
}: {
  children: ReactNode;
  userEmail?: string;
}) {
  const { open, toggle } = useRailRight();

  return (
    <div className="relative h-dvh overflow-hidden text-zinc-900">
      <div className="pointer-events-none absolute inset-0 bg-lin-brut" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(ellipse_80%_60%_at_50%_30%,theme(colors.accent.500/12%)_0%,transparent_70%)]" />

      <RailLeft userEmail={userEmail} />
      <CenterPanel chatOpen={open}>{children}</CenterPanel>
      <RailRight open={open} toggle={toggle} />
      <MobileAssistant />
      <OnboardingLauncher />
    </div>
  );
}
