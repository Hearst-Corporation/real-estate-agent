"use client";

import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { AccentSelector } from "./AccentSelector";
import { UI } from "@/lib/ui-strings";
import {
  IconDashboard,
  IconEstimations,
  IconProperties,
  IconLeads,
  IconVisits,
  IconMandates,
  IconAgenda,
  IconSwarms,
  IconInvest,
  IconAdmin,
} from "./nav-icons";

const INITIALS_LEN = 2;

type IconType = ComponentType<SVGProps<SVGSVGElement>>;
type NavItem = { href: string; label: string; Icon: IconType; exact?: boolean };

/**
 * Source unique de la navigation. Toute route du dashboard vit ici — le rail
 * gauche est désormais la SEULE barre de nav (la barre du bas a été supprimée).
 * `exact` → match strict (utile pour "/" qui sinon préfixe tout).
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/", label: UI.nav.dashboard, Icon: IconDashboard, exact: true },
  { href: "/estimations", label: UI.nav.estimations, Icon: IconEstimations },
  { href: "/properties", label: UI.nav.properties, Icon: IconProperties },
  { href: "/leads", label: UI.nav.leads, Icon: IconLeads },
  { href: "/visits", label: UI.nav.visits, Icon: IconVisits },
  { href: "/mandates", label: UI.nav.mandates, Icon: IconMandates },
  { href: "/agenda", label: UI.nav.agenda, Icon: IconAgenda },
  { href: "/swarms", label: UI.nav.swarms, Icon: IconSwarms },
  { href: "/invest", label: UI.nav.invest, Icon: IconInvest },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function RailLeft({ userEmail, isAdmin = false }: { userEmail?: string; isAdmin?: boolean }) {
  const pathname = usePathname();
  const initials = (userEmail ?? "?").slice(0, INITIALS_LEN).toUpperCase();
  const profileActive = pathname === "/profile" || pathname.startsWith("/profile/");

  return (
    <nav className="ct-rail-left" aria-label={UI.nav.home}>
      <Link href="/" className="ct-logo-slot" title={UI.nav.home}>
        <Logo />
      </Link>

      <div className="ct-rail-actions">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item);
          const { Icon } = item;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`ct-rail-action${active ? " active" : ""}`}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <Icon />
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
            <IconAdmin />
          </Link>
        )}
      </div>

      <div className="ct-spacer" />

      <div className="ct-rail-bottom">
        <AccentSelector />
        <div className="ct-rail-divider" />
        <Link
          href="/profile"
          className={`ct-avatar${profileActive ? " active" : ""}`}
          title={UI.nav.profile}
          aria-label={UI.nav.profile}
          aria-current={profileActive ? "page" : undefined}
        >
          {initials}
        </Link>
      </div>
    </nav>
  );
}
