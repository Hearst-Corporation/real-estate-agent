import Link from "next/link";
import { Logo } from "./Logo";
import { AccentSelector } from "./AccentSelector";

export function RailLeft({ userEmail }: { userEmail?: string }) {
  const initials = (userEmail ?? "?").slice(0, 2).toUpperCase();
  return (
    <nav className="ct-rail-left" aria-label="Navigation">
      <Link href="/" className="ct-logo-slot" title="Accueil">
        <Logo />
      </Link>

      <div className="ct-spacer" />

      <div className="ct-rail-bottom">
        <AccentSelector />
        <div className="ct-rail-divider" />
        <Link href="/profile" className="ct-avatar" title="Profil">
          {initials}
        </Link>
      </div>
    </nav>
  );
}
