"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { AccentSelector } from "./AccentSelector";
import { UI } from "@/lib/ui-strings";

const INITIALS_LEN = 2;

type NavItem = { href: string; label: string; icon: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/estimations", label: UI.nav.estimations, icon: "€" },
  { href: "/properties", label: UI.nav.properties, icon: "B" },
  { href: "/leads", label: UI.nav.leads, icon: "L" },
  { href: "/visits", label: UI.nav.visits, icon: "V" },
  { href: "/mandates", label: UI.nav.mandates, icon: "M" },
  { href: "/swarms", label: UI.nav.swarms, icon: "S" },
];

export function RailLeft({ userEmail, isAdmin = false }: { userEmail?: string; isAdmin?: boolean }) {
  const pathname = usePathname();
  const initials = (userEmail ?? "?").slice(0, INITIALS_LEN).toUpperCase();

  return (
    <nav className="ct-rail-left" aria-label={UI.nav.home}>
      <Link href="/" className="ct-logo-slot" title={UI.nav.home}>
        <Logo />
      </Link>

      <div className="ct-rail-actions">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`ct-rail-action${active ? " active" : ""}`}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              {item.icon}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin"
            className={`ct-rail-action${pathname.startsWith("/admin") ? " active" : ""}`}
            title={UI.nav.admin}
            aria-label={UI.nav.admin}
            aria-current={pathname.startsWith("/admin") ? "page" : undefined}
          >
            A
          </Link>
        )}
      </div>

      <div className="ct-spacer" />

      <div className="ct-rail-bottom">
        <AccentSelector />
        <div className="ct-rail-divider" />
        <Link href="/profile" className="ct-avatar" title={UI.nav.profile}>
          {initials}
        </Link>
      </div>
    </nav>
  );
}
