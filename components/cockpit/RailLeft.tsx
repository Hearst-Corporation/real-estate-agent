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

const RAIL_ACTION =
  "group relative flex w-16 flex-col items-center gap-1 rounded-xl py-2.5 text-zinc-500 transition-colors hover:bg-zinc-950/5 hover:text-zinc-900";
const RAIL_ACTION_ACTIVE = "bg-accent-500/15 text-accent-700";

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
    <nav
      className="fixed inset-y-0 left-0 z-20 flex w-rail-left flex-col items-center border-r border-zinc-950/10 bg-white/60 py-6 backdrop-blur-xl"
      aria-label={UI.nav.home}
    >
      <Link
        href="/"
        className="mb-6 flex size-10 items-center justify-center rounded-lg bg-accent-500/10 text-accent-600"
        title={UI.nav.home}
      >
        <Logo />
      </Link>

      {/* Espace flexible : centre le bloc de nav sur l'axe vertical du rail. */}
      <div className="flex-1" />

      <div className="flex flex-col items-center gap-1">
        {navRail.map((item) => {
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${RAIL_ACTION} ${active ? RAIL_ACTION_ACTIVE : ""}`}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <span aria-hidden="true">
                <Icon name={item.icon} className="size-5" />
              </span>
              <span className="max-w-full truncate px-1 text-[10px] font-medium leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}

        <div ref={menuRef} className="relative">
          <button
            type="button"
            className={`${RAIL_ACTION} ${menuOpen ? RAIL_ACTION_ACTIVE : ""}`}
            title={UI.dashboard.actions.create}
            aria-label={UI.dashboard.actions.create}
            aria-expanded={menuOpen}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          >
            <span aria-hidden="true">
              <Icon name="plus" className="size-5" />
            </span>
            <span className="max-w-full truncate px-1 text-[10px] font-medium leading-none">
              {UI.dashboard.actions.create}
            </span>
          </button>

          {menuOpen && (
            <div className="absolute left-full top-0 z-30 ml-2 flex w-52 flex-col gap-1 rounded-xl border border-zinc-950/10 bg-white/95 p-2 shadow-2xl backdrop-blur-xl">
              {getCreateItems().map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-950/5"
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1" />

      <div className="pt-4">
        <Link
          href="/profile"
          className={`flex size-10 items-center justify-center rounded-full bg-zinc-950/5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-accent-500/30 ${
            pathname.startsWith("/profile") || pathname.startsWith("/admin") ? "ring-2 ring-accent-400" : ""
          }`}
          title={UI.nav.profile}
        >
          {initials}
        </Link>
      </div>
    </nav>
  );
}
