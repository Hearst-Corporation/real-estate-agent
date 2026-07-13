import type { ReactNode } from "react";
import { BottomBar } from "./BottomBar";

/**
 * Zone principale (`<main>`) du bloc `02-full-width-secondary-column-on-right` :
 * `pl` réserve le rail gauche `fixed` (104px), `pr` réserve le chat `fixed`
 * (420px ouvert / 40px replié). Le contenu occupe tout l'espace restant.
 */
export function CenterPanel({
  children,
  chatOpen,
}: {
  children: ReactNode;
  chatOpen: boolean;
}) {
  return (
    <main
      className={`relative z-10 flex h-full flex-col pl-rail-left transition-[padding] duration-200 ${
        chatOpen ? "pr-rail-right" : "pr-10"
      }`}
    >
      <div className="ct-page-area scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-8 py-8 @container">
        {children}
      </div>
      <BottomBar />
    </main>
  );
}
