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
      className="absolute inset-x-0 bottom-0 z-30 hidden border-t border-zinc-950/10 bg-lin-brut/95 px-2 py-1.5 backdrop-blur-xl max-sm:block"
      aria-label={UI.nav.home}
    >
      <div className="flex items-stretch justify-around gap-1">
        {MOBILE_SHORTCUTS.map((item) => {
          const active = isActive(item.href, pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ${
                active ? "bg-accent-500/10 text-accent-700" : "text-zinc-500 hover:bg-zinc-950/5"
              }`}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} className="size-5" />
              <span className="max-w-full truncate px-0.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
