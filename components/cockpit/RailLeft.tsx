"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { UI } from "@/lib/ui-strings";
import { Icon, IconName } from "./Icon";

const INITIALS_LEN = 2;

type NavItem = { href: string; label: string; icon: IconName };

const PRIMARY_ITEMS: NavItem[] = [
  { href: "/estimations", label: UI.nav.estimations, icon: "estimate" },
  { href: "/prospection", label: UI.nav.prospection, icon: "search" },
  { href: "/swarms", label: UI.nav.swarms, icon: "network" },
];

const CRM_ITEMS: NavItem[] = [
  { href: "/properties", label: UI.nav.properties, icon: "properties" },
  { href: "/leads", label: UI.nav.leads, icon: "leads" },
  { href: "/visits", label: UI.nav.visits, icon: "visits" },
  { href: "/mandates", label: UI.nav.mandates, icon: "mandates" },
  { href: "/agenda", label: UI.nav.agenda, icon: "agenda" },
];

export function RailLeft({ userEmail }: { userEmail?: string; isAdmin?: boolean }) {
  const pathname = usePathname();
  const initials = (userEmail ?? "?").slice(0, INITIALS_LEN).toUpperCase();

  const isCrmActive = CRM_ITEMS.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <nav className="ct-rail-left" aria-label={UI.nav.home}>
      <Link href="/" className="ct-logo-slot" title={UI.nav.home}>
        <Logo />
      </Link>

      <div className="ct-rail-actions">
        {PRIMARY_ITEMS.map((item) => {
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
              <span className="ct-rail-action-icon"><Icon name={item.icon} /></span>
              <span className="ct-rail-action-label">{item.label}</span>
            </Link>
          );
        })}

        <div className="ct-rail-divider" />

        <Link 
          href="/properties"
          className={`ct-rail-action${isCrmActive ? " active" : ""}`}
          title="CRM"
          aria-label="CRM Menu"
        >
          <span className="ct-rail-action-icon">
            <Icon name="crm" />
          </span>
          <span className="ct-rail-action-label">CRM</span>
        </Link>
      </div>

      <div className="ct-spacer" />

      <div className="ct-rail-bottom">
        <Link
          href="/profile"
          className={`ct-avatar${pathname.startsWith("/profile") || pathname.startsWith("/admin") ? " active" : ""}`}
          title={UI.nav.profile}
        >
          {initials}
        </Link>
      </div>
    </nav>
  );
}
