"use client";

import { usePathname } from "next/navigation";
import { tabGroupFor } from "@/config/nav";
import { UI } from "@/lib/ui-strings";
import { PageNavTabs } from "./PageNavTabs";

/**
 * SUB-NAV DE GROUPE — rendue UNE fois par le shell, dérivée du manifeste.
 * =================================================================
 *
 * Les surfaces d'un même travail utilisateur (portefeuille, clients,
 * prospection, pilotage, agents) partagent un groupe d'onglets déclaré dans
 * `config/nav.ts`. Le rail gauche ne porte que les 6 points d'entrée ; toutes
 * les autres surfaces s'atteignent ici. Une route hors groupe (ex. `/agenda`)
 * ou un groupe à un seul membre ne rend rien.
 */
export function SubNav() {
  const pathname = usePathname();
  const tabs = tabGroupFor(pathname);
  if (!tabs) return null;

  return (
    <nav
      aria-label={UI.nav.sections}
      className="-mt-1 mb-6 flex flex-wrap items-center gap-1 border-b border-zinc-950/5 pb-3"
    >
      <PageNavTabs tabs={tabs} />
    </nav>
  );
}
