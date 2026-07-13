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
    <nav
      className="absolute inset-x-0 bottom-0 z-30 hidden border-t border-zinc-950/10 bg-lin-brut/95 px-4 py-2 backdrop-blur-xl max-sm:block"
      aria-label={UI.nav.home}
    >
      <div className="flex items-center justify-around gap-2">
        {MOBILE_SHORTCUTS.map((item) => {
          const active = isActive(item.href, pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 text-[10px] font-semibold transition-colors ${
                active ? "text-accent-700" : "text-zinc-500"
              }`}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} className="size-6" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
