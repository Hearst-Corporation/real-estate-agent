import type { ReactNode } from "react";
import { BottomBar } from "./BottomBar";

export function CenterPanel({ children }: { children: ReactNode }) {
  return (
    <main className="ct-center-panel">
      <div className="ct-page-area">{children}</div>
      <BottomBar />
    </main>
  );
}
