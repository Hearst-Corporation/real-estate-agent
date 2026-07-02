import type { ReactNode } from "react";
import { BottomBar } from "./BottomBar";

export function CenterPanel({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      {/*
        `.ct-page-area` reste un HOOK DOM stable (pas un token de style) :
        RailRight.tsx cible ce sélecteur via document.querySelector pour
        toggler la classe `chat-open` (réserve l'espace du drawer chat).
      */}
      <div className="ct-page-area scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-8 py-8 transition-[padding] duration-200 [&.chat-open]:pr-[calc(420px+2rem)] @container">
        {children}
      </div>
      <BottomBar />
    </main>
  );
}
