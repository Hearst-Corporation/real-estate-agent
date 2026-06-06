"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { ChatKimi } from "./ChatKimi";
import { UI } from "@/lib/ui-strings";

const STORAGE_KEY = "cockpit:rail-right-open";
const CHANGE_EVENT = "cockpit:rail-right-open-change";

function readUserOpenPreference() {
  if (typeof window === "undefined") return true;
  if (window.innerWidth <= 1024) return false;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) return saved === "true";
  return true;
}

function subscribeToUserOpenPreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("resize", onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("resize", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

export function RailRight() {
  const pathname = usePathname();
  const onInterview = pathname.startsWith("/estimations/") && pathname !== "/estimations/new";

  const userOpen = useSyncExternalStore(
    subscribeToUserOpenPreference,
    readUserOpenPreference,
    () => true,
  );
  const [override, setOverride] = useState<{ pathname: string; open: boolean } | null>(null);
  // Dérivé en render : identique au SSR (usePathname est hydration-stable) → aucun flash.
  const interviewOverride = override?.pathname === pathname ? override.open : null;
  const open = interviewOverride ?? (onInterview ? false : userOpen);

  function toggle() {
    if (onInterview) {
      // Sur l'entretien : override local, sans polluer le choix global persisté.
      setOverride((current) => ({
        pathname,
        open: current?.pathname === pathname ? !current.open : true,
      }));
      return;
    }
    localStorage.setItem(STORAGE_KEY, String(!userOpen));
    window.dispatchEvent(new Event(CHANGE_EVENT));
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
