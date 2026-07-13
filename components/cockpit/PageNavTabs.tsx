"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TabItem } from "@/config/nav";

export type { TabItem } from "@/config/nav";

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
