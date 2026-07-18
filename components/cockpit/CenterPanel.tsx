import type { ReactNode } from "react";
import { BottomBar } from "./BottomBar";
import { SubNav } from "./SubNav";

/**
 * Zone principale (`<main>`) du bloc `02-full-width-secondary-column-on-right` :
 * `pl` réserve le rail gauche `fixed` (104px), `pr` réserve le chat `fixed`
 * (420px ouvert / 40px replié). Le contenu occupe l'espace restant, borné à une
 * largeur de lecture confortable (`max-w`, centré) pour ne pas s'étirer à
 * l'infini sur les très grands écrans (27"/ultra-wide) tout en restant pleine
 * largeur sous cette borne.
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
      <div className="ct-page-area scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 pt-6 pb-24 @container sm:px-8 sm:py-8">
          {/* Sous-nav du groupe de travail courant (dérivée de config/nav.ts). */}
          <SubNav />
          {children}
        </div>
      </div>
      <BottomBar />
    </main>
  );
}
