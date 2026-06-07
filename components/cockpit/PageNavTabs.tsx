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
            className={`ct-page-header-nav-item${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </>
  );
}
