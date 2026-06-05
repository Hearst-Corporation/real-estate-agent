"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChatKimi } from "./ChatKimi";
import { UI } from "@/lib/ui-strings";

export function RailRight() {
  const pathname = usePathname();
  const onInterview = pathname.startsWith("/estimations/") && pathname !== "/estimations/new";

  const [userOpen, setUserOpen] = useState(true);
  const [override, setOverride] = useState<boolean | null>(null);
  // Dérivé en render : identique au SSR (usePathname est hydration-stable) → aucun flash.
  const open = override ?? (onInterview ? false : userOpen);

  useEffect(() => {
    const saved = localStorage.getItem("cockpit:rail-right-open");
    // Hydratation post-mount depuis localStorage (indispo en SSR) → setState volontaire.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved !== null) {
      setUserOpen(saved === "true");
    } else if (window.innerWidth <= 1024) {
      // Mobile/tablette : le chat est un overlay flottant. Replié par défaut (sans
      // préférence sauvée) pour ne pas masquer le contenu au chargement.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserOpen(false);
    }
  }, []);

  useEffect(() => {
    // Repart replié à chaque (dé)passage d'une page d'entretien.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverride(null);
  }, [onInterview]);

  function toggle() {
    if (onInterview) {
      // Sur l'entretien : override local, sans polluer le choix global persisté.
      setOverride((o) => (o == null ? true : !o));
      return;
    }
    setUserOpen((prev) => {
      const next = !prev;
      localStorage.setItem("cockpit:rail-right-open", String(next));
      return next;
    });
  }

  if (!open) {
    return (
      <aside className="ct-rail-right collapsed" aria-label={UI.chat.title}>
        <button type="button" className="ct-rail-right-reopen" onClick={toggle}>
          {UI.chat.reopen}
        </button>
      </aside>
    );
  }

  return (
    <aside className="ct-rail-right" aria-label={UI.chat.title}>
      <div className="ct-rail-right-header">
        <span className="ct-rail-right-title">{UI.chat.title}</span>
        <button
          type="button"
          className="ct-rail-right-btn"
          onClick={toggle}
          title={UI.chat.collapse}
          aria-label={UI.chat.collapse}
        >
          ›
        </button>
      </div>
      <div className="ct-rail-right-body">
        <ChatKimi />
      </div>
    </aside>
  );
}
