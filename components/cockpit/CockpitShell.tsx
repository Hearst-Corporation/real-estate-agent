import type { ReactNode } from "react";
import { RailLeft } from "./RailLeft";
import { CenterPanel } from "./CenterPanel";
import { RailRight } from "./RailRight";

export function CockpitShell({
  children,
  userEmail,
}: {
  children: ReactNode;
  userEmail?: string;
}) {
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-slate-950" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(ellipse_80%_60%_at_50%_30%,theme(colors.indigo.600/25%)_0%,transparent_70%)]" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-row items-stretch overflow-hidden">
        <RailLeft userEmail={userEmail} />
        <CenterPanel>{children}</CenterPanel>
        <RailRight />
      </div>
    </div>
  );
}
