"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SEGMENTS = [
  { href: "/", label: "Dashboard" },
  { href: "/profile", label: "Profil" },
];

export function BottomBar() {
  const pathname = usePathname();
  return (
    <div className="ct-bottom-bar">
      <div className="ct-bottom-bar-inner">
        <span className="ct-bottom-label">Real estate Agent</span>
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
