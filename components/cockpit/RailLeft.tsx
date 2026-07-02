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
  "group relative flex w-16 flex-col items-center gap-1 rounded-xl py-2.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100";
const RAIL_ACTION_ACTIVE = "bg-indigo-500/15 text-indigo-300";

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
      className="relative z-20 flex w-[104px] shrink-0 flex-col items-center border-r border-white/10 bg-white/[0.03] py-6 backdrop-blur-xl"
      aria-label={UI.nav.home}
    >
      <Link
        href="/"
        className="mb-6 flex size-10 items-center justify-center rounded-lg bg-white/[0.06] text-white"
        title={UI.nav.home}
      >
        <Logo />
      </Link>

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
            <div className="absolute left-full top-0 z-30 ml-2 flex w-52 flex-col gap-1 rounded-xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl">
              {getCreateItems().map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/5"
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
          className={`flex size-10 items-center justify-center rounded-full bg-white/[0.06] text-sm font-semibold text-white transition-colors hover:bg-indigo-500/30 ${
            pathname.startsWith("/profile") || pathname.startsWith("/admin") ? "ring-2 ring-indigo-400" : ""
          }`}
          title={UI.nav.profile}
        >
          {initials}
        </Link>
      </div>
    </nav>
  );
}
