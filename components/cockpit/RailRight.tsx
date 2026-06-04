"use client";

import { useEffect, useState } from "react";
import { ChatKimi } from "./ChatKimi";
import { UI } from "@/lib/ui-strings";

export function RailRight() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("cockpit:rail-right-open");
    // Hydratation post-mount depuis localStorage (indispo en SSR) → setState volontaire.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved !== null) setOpen(saved === "true");
  }, []);

  function toggle() {
    setOpen((prev) => {
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
        <button type="button" className="ct-rail-right-btn" onClick={toggle} title={UI.chat.collapse} aria-label={UI.chat.collapse}>
          ›
        </button>
      </div>
      <div className="ct-rail-right-body">
        <ChatKimi />
      </div>
    </aside>
  );
}
