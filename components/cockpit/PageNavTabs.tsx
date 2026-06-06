"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type TabItem = { href: string; label: string };

export function PageNavTabs({ tabs }: { tabs: TabItem[] }) {
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
