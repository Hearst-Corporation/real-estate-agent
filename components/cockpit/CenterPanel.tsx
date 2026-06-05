import type { ReactNode } from "react";

export function CenterPanel({ children }: { children: ReactNode; isAdmin?: boolean }) {
  return (
    <main className="ct-center-panel">
      <div className="ct-page-area">{children}</div>
    </main>
  );
}
