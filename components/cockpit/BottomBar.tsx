"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UI } from "@/lib/ui-strings";

const SEGMENTS = [
  { href: "/", label: UI.nav.dashboard },
  { href: "/profile", label: UI.nav.profile },
];

export function BottomBar() {
  const pathname = usePathname();
  return (
    <div className="ct-bottom-bar">
      <div className="ct-bottom-bar-inner">
        <span className="ct-bottom-label">{UI.app.name}</span>
        <div className="ct-seg-track">
          {SEGMENTS.map((s) => {
            const active = s.href === "/" ? pathname === "/" : pathname.startsWith(s.href);
            return (
              <Link key={s.href} href={s.href} className={`ct-seg-btn${active ? " active" : ""}`}>
                {s.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
