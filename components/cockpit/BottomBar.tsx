"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { Icon } from "./Icon";
import { MOBILE_SHORTCUTS } from "@/config/nav";

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

export function BottomBar() {
  const pathname = usePathname();

  return (
    <nav className="ct-bottom-bar" aria-label={UI.nav.home}>
      <div className="ct-bottom-bar-inner">
        {MOBILE_SHORTCUTS.map((item) => {
          const active = isActive(item.href, pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`ct-bottom-nav-item${active ? " active" : ""}`}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
