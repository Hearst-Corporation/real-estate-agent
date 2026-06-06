"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { UI } from "@/lib/ui-strings";

const INITIALS_LEN = 2;

type IconName = "estimate" | "building" | "users" | "calendar" | "agenda" | "file" | "search" | "network" | "shield";
type NavItem = { href: string; label: string; icon: IconName };

const NAV_ITEMS: NavItem[] = [
  { href: "/estimations", label: UI.nav.estimations, icon: "estimate" },
  { href: "/properties", label: UI.nav.properties, icon: "building" },
  { href: "/leads", label: UI.nav.leads, icon: "users" },
  { href: "/visits", label: UI.nav.visits, icon: "calendar" },
  { href: "/agenda", label: UI.nav.agenda, icon: "agenda" },
  { href: "/mandates", label: UI.nav.mandates, icon: "file" },
  { href: "/prospection", label: UI.nav.prospection, icon: "search" },
  { href: "/swarms", label: UI.nav.swarms, icon: "network" },
];

function RailIcon({ name }: { name: IconName }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true };
  const strokeProps = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (name) {
    case "estimate":
      return <svg {...common}><path {...strokeProps} d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path {...strokeProps} d="M9 8h6M9 12h6M9 16h3" /><path {...strokeProps} d="M16 16h.01" /></svg>;
    case "building":
      return <svg {...common}><path {...strokeProps} d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path {...strokeProps} d="M16 9h2a2 2 0 0 1 2 2v10" /><path {...strokeProps} d="M8 7h4M8 11h4M8 15h4M9 21v-3h2v3" /></svg>;
    case "users":
      return <svg {...common}><path {...strokeProps} d="M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4" /><circle {...strokeProps} cx="12" cy="8" r="3" /><path {...strokeProps} d="M20 18c0-1.6-1-3-2.4-3.6M16.5 5.2a2.5 2.5 0 0 1 0 4.6" /></svg>;
    case "calendar":
      return <svg {...common}><path {...strokeProps} d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a2 2 0 0 1 2-2Z" /><path {...strokeProps} d="M8 13h3M8 17h5" /></svg>;
    case "agenda":
      return <svg {...common}><path {...strokeProps} d="M8 4h9a2 2 0 0 1 2 2v14H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" /><path {...strokeProps} d="M8 4v17M11 8h5M11 12h5" /></svg>;
    case "file":
      return <svg {...common}><path {...strokeProps} d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path {...strokeProps} d="M14 3v6h5M8 14h8M8 18h5" /></svg>;
    case "search":
      return <svg {...common}><circle {...strokeProps} cx="11" cy="11" r="6" /><path {...strokeProps} d="m16 16 4 4" /><path {...strokeProps} d="M9 11h4" /></svg>;
    case "network":
      return <svg {...common}><circle {...strokeProps} cx="12" cy="5" r="2.5" /><circle {...strokeProps} cx="6" cy="18" r="2.5" /><circle {...strokeProps} cx="18" cy="18" r="2.5" /><path {...strokeProps} d="M10.8 7.2 7.2 15.8M13.2 7.2l3.6 8.6M8.5 18h7" /></svg>;
    case "shield":
      return <svg {...common}><path {...strokeProps} d="M12 3 20 6v6c0 5-3.3 7.7-8 9-4.7-1.3-8-4-8-9V6l8-3Z" /><path {...strokeProps} d="M9 12l2 2 4-5" /></svg>;
  }
}

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
              <span className="ct-rail-action-icon">
                <RailIcon name={item.icon} />
              </span>
              <span className="ct-rail-action-label">{item.label}</span>
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
            <span className="ct-rail-action-icon">
              <RailIcon name="shield" />
            </span>
            <span className="ct-rail-action-label">{UI.nav.admin}</span>
          </Link>
        )}
      </div>

      <div className="ct-spacer" />

      <div className="ct-rail-bottom">
        <Link href="/profile" className="ct-avatar" title={UI.nav.profile}>
          {initials}
        </Link>
      </div>
    </nav>
  );
}
