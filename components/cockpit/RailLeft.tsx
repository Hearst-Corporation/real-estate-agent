import Link from "next/link";
import { Logo } from "./Logo";
import { AccentSelector } from "./AccentSelector";
import { UI } from "@/lib/ui-strings";

const INITIALS_LEN = 2;

export function RailLeft({ userEmail }: { userEmail?: string }) {
  const initials = (userEmail ?? "?").slice(0, INITIALS_LEN).toUpperCase();
  return (
    <nav className="ct-rail-left" aria-label={UI.nav.home}>
      <Link href="/" className="ct-logo-slot" title={UI.nav.home}>
        <Logo />
      </Link>

      <div className="ct-spacer" />

      <div className="ct-rail-bottom">
        <AccentSelector />
        <div className="ct-rail-divider" />
        <Link href="/profile" className="ct-avatar" title={UI.nav.profile}>
          {initials}
        </Link>
      </div>
    </nav>
  );
}
