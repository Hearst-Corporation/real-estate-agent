"use client";

import type { ReactNode } from "react";
import { RailLeft } from "./RailLeft";
import { CenterPanel } from "./CenterPanel";
import { RailRight } from "./RailRight";
import { useRailRight } from "./useRailRight";

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
    <div className="relative h-dvh overflow-hidden text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-slate-950" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(ellipse_80%_60%_at_50%_30%,theme(colors.indigo.600/25%)_0%,transparent_70%)]" />

      <RailLeft userEmail={userEmail} />
      <CenterPanel chatOpen={open}>{children}</CenterPanel>
      <RailRight open={open} toggle={toggle} />
    </div>
  );
}
