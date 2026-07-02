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
              active ? "bg-indigo-500/15 text-indigo-300" : "text-slate-400 hover:text-slate-100"
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
