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
      className={`relative z-10 flex h-full flex-col transition-[padding] duration-200 sm:pl-rail-left ${
        chatOpen ? "sm:pr-rail-right" : "sm:pr-10"
      }`}
    >
      <div className="ct-page-area scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 pt-6 pb-24 @container sm:px-8 sm:py-8">
        {children}
      </div>
      <BottomBar />
    </main>
  );
}
