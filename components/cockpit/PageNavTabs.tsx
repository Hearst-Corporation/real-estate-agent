"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppRoute, TabItem } from "@/config/nav";
import { CORE_ANCHORS } from "@/lib/onboarding/tours";

export type { TabItem } from "@/config/nav";

/**
 * Onglet porteur de l'ancre de visite guidée « centre d'actions » : c'est le
 * point d'entrée du shell vers la surface dédiée. Typé `AppRoute` → si la route
 * quitte le manifeste `config/nav.ts`, la compilation échoue (pas de route morte).
 */
const ACTION_CENTER_ROUTE: AppRoute = "/action-center";

export function PageNavTabs({ tabs }: { tabs: readonly TabItem[] }) {
  const pathname = usePathname();

  return (
    <>
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-tour-id={
              tab.href === ACTION_CENTER_ROUTE ? CORE_ANCHORS.actionCenter : undefined
            }
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-accent-500/15 text-accent-700" : "text-zinc-500 hover:text-zinc-900"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </>
  );
}
