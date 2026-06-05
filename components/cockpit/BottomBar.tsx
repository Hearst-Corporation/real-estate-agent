"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UI } from "@/lib/ui-strings";

const SEGMENTS = [
  { href: "/", label: UI.nav.dashboard },
  { href: "/estimations", label: UI.nav.estimations },
  { href: "/properties", label: UI.nav.properties },
  { href: "/leads", label: UI.nav.leads },
  { href: "/visits", label: UI.nav.visits },
  { href: "/mandates", label: UI.nav.mandates },
  { href: "/swarms", label: UI.nav.swarms },
  { href: "/profile", label: UI.nav.profile },
];

const ADMIN_SEGMENT = { href: "/admin", label: UI.nav.admin };

export function BottomBar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const segments = isAdmin ? [...SEGMENTS, ADMIN_SEGMENT] : SEGMENTS;
  return (
    <div className="ct-bottom-bar">
      <div className="ct-bottom-bar-inner">
        <span className="ct-bottom-label">{UI.app.name}</span>
        <div className="ct-seg-track">
          {segments.map((s) => {
            const active =
              s.href === "/" ? pathname === "/" : pathname === s.href || pathname.startsWith(s.href + "/");
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`ct-seg-btn${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
