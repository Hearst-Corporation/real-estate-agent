import type { ReactNode } from "react";
import { RailLeft } from "./RailLeft";
import { CenterPanel } from "./CenterPanel";
import { RailRight } from "./RailRight";

export function CockpitShell({
  children,
  userEmail,
  isAdmin = false,
}: {
  children: ReactNode;
  userEmail?: string;
  isAdmin?: boolean;
}) {
  return (
    <div className="ct-root">
      <div className="ct-ambient-deep" />
      <div className="ct-ambient-glow" />
      <div className="ct-panels-row">
        <RailLeft userEmail={userEmail} isAdmin={isAdmin} />
        <CenterPanel>{children}</CenterPanel>
        <RailRight />
      </div>
    </div>
  );
}
