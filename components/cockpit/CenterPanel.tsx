import type { ReactNode } from "react";
import { BottomBar } from "./BottomBar";

export function CenterPanel({ children, isAdmin = false }: { children: ReactNode; isAdmin?: boolean }) {
  return (
    <main className="ct-center-panel">
      <div className="ct-page-area">{children}</div>
      <BottomBar isAdmin={isAdmin} />
    </main>
  );
}
