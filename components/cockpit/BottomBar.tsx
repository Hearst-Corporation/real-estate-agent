"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { Icon } from "./Icon";

export function BottomBar() {
  const pathname = usePathname();

  const NAV_ITEMS = [
    { href: "/estimations", label: UI.nav.estimations, icon: "estimate" as const },
    { href: "/prospection", label: UI.nav.prospection, icon: "search" as const },
    { href: "/properties", label: "CRM", icon: "crm" as const },
    { href: "/swarms", label: UI.nav.swarms, icon: "network" as const },
    { href: "/profile", label: UI.nav.profile, icon: "user" as const },
  ];

  return (
    <div className="ct-bottom-bar">
      <div className="ct-bottom-bar-inner">
        {NAV_ITEMS.map((item) => {
          // Pour le CRM, on allume l'onglet si on est sur n'importe quelle page CRM
          const isCrm = item.icon === "crm";
          const crmHrefs = ["/properties", "/leads", "/visits", "/mandates", "/agenda"];
          const active = isCrm 
            ? crmHrefs.some(h => pathname === h || pathname.startsWith(h + "/"))
            : pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`ct-bottom-nav-item${active ? " active" : ""}`}
              title={item.label}
              aria-label={item.label}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
