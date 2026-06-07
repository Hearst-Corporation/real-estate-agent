"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { UI } from "@/lib/ui-strings";
import { Icon } from "./Icon";
import { navPrimary, navCrm, CRM_ENTRY } from "@/config/nav";

const INITIALS_LEN = 2;

export function RailLeft({ userEmail }: { userEmail?: string; isAdmin?: boolean }) {
  const pathname = usePathname();
  const initials = (userEmail ?? "?").slice(0, INITIALS_LEN).toUpperCase();

  const isCrmActive = navCrm.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <nav className="ct-rail-left" aria-label={UI.nav.home}>
      <Link href="/" className="ct-logo-slot" title={UI.nav.home}>
        <Logo />
      </Link>

      <div className="ct-rail-actions">
        {navPrimary.map((item) => {
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
          href={CRM_ENTRY.href}
          className={`ct-rail-action${isCrmActive ? " active" : ""}`}
          title={UI.nav.crm}
          aria-label={UI.nav.crm}
        >
          <span className="ct-rail-action-icon">
            <Icon name="crm" />
          </span>
          <span className="ct-rail-action-label">{UI.nav.crm}</span>
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
