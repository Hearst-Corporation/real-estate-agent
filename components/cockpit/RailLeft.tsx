"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { UI } from "@/lib/ui-strings";
import { Icon } from "./Icon";
import { navRail } from "@/config/nav";

const INITIALS_LEN = 2;

const PORTEFEUILLE_ROUTES = ["/properties", "/estimations", "/mandates"];
const CLIENTS_ROUTES = ["/leads", "/visits"];

function isActive(itemHref: string, pathname: string): boolean {
  if (itemHref === "/") return pathname === "/";
  if (itemHref === "/properties") {
    return PORTEFEUILLE_ROUTES.some(
      (r) => pathname === r || pathname.startsWith(r + "/")
    );
  }
  if (itemHref === "/leads") {
    return CLIENTS_ROUTES.some(
      (r) => pathname === r || pathname.startsWith(r + "/")
    );
  }
  return pathname === itemHref || pathname.startsWith(itemHref + "/");
}

// Labels définis au runtime pour accéder à UI (évite circular import statique)
function getCreateItems() {
  const a = UI.dashboard.actions;
  return [
    { href: "/estimations/new",  label: `+ ${a.newEstimation}` },
    { href: "/leads?new=1",      label: `+ ${a.newClient}` },
    { href: "/visits?new=1",     label: `+ ${a.newVisit}` },
    { href: "/properties?new=1", label: `+ ${a.newProperty}` },
  ];
}

export function RailLeft({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const initials = (userEmail ?? "?").slice(0, INITIALS_LEN).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [menuOpen]);

  return (
    <nav className="ct-rail-left" aria-label={UI.nav.home}>
      <Link href="/" className="ct-logo-slot" title={UI.nav.home}>
        <Logo />
      </Link>

      <div className="ct-rail-actions">
        {navRail.map((item) => {
          const active = isActive(item.href, pathname);
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

        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            type="button"
            className={`ct-rail-action${menuOpen ? " active" : ""}`}
            title={UI.dashboard.actions.create}
            aria-label={UI.dashboard.actions.create}
            aria-expanded={menuOpen}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          >
            <span className="ct-rail-action-icon"><Icon name="plus" /></span>
            <span className="ct-rail-action-label">{UI.dashboard.actions.create}</span>
          </button>

          {menuOpen && (
            <div
              className="ct-card"
              style={{ position: "absolute", left: "100%", top: 0, zIndex: "var(--ct-z-flyout)", minWidth: "var(--ct-prose-sm)", padding: "var(--ct-space-2xs) 0" }}
            >
              {getCreateItems().map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="ct-rail-action"
                  style={{ padding: "var(--ct-space-xs) var(--ct-space-md)", display: "block", whiteSpace: "nowrap" }}
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
        </div>
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
