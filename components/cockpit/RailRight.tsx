"use client";

import { useEffect, useState } from "react";
import { ChatKimi } from "./ChatKimi";

export function RailRight() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("cockpit:rail-right-open");
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
      <aside className="ct-rail-right collapsed" aria-label="Chat (replié)">
        <button type="button" className="ct-rail-right-reopen" onClick={toggle}>
          Chat
        </button>
      </aside>
    );
  }

  return (
    <aside className="ct-rail-right" aria-label="Chat Kimi">
      <div className="ct-rail-right-header">
        <span className="ct-rail-right-title">Assistant</span>
        <button type="button" className="ct-rail-right-btn" onClick={toggle} title="Replier" aria-label="Replier le chat">
          ›
        </button>
      </div>
      <div className="ct-rail-right-body">
        <ChatKimi />
      </div>
    </aside>
  );
}
