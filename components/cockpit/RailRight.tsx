"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { ChatKimi } from "./ChatKimi";
import { UI } from "@/lib/ui-strings";
import { BREAKPOINT_COLLAPSE_PX } from "@/lib/ui/constants";

const STORAGE_KEY = "cockpit:rail-right-open";
const CHANGE_EVENT = "cockpit:rail-right-open-change";

function readUserOpenPreference() {
  if (typeof window === "undefined") return true;
  if (window.innerWidth <= BREAKPOINT_COLLAPSE_PX) return false;
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

  useEffect(() => {
    const area = document.querySelector(".ct-page-area");
    if (!area) return;
    area.classList.toggle("chat-open", open);
    return () => area.classList.remove("chat-open");
  }, [open]);

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
      <aside
        className="relative z-20 flex w-10 shrink-0 items-start justify-center border-l border-white/10 bg-white/[0.03] pt-6"
        aria-label={UI.chat.title}
      >
        <button
          type="button"
          onClick={toggle}
          className="rounded-md px-1.5 py-3 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 [writing-mode:vertical-rl]"
        >
          {UI.chat.reopen}
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="relative z-20 flex w-[420px] shrink-0 flex-col border-l border-white/10 bg-white/[0.03] backdrop-blur-xl"
      aria-label={UI.chat.title}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-sm font-semibold text-slate-100">{UI.chat.title}</span>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          onClick={toggle}
          title={UI.chat.collapse}
          aria-label={UI.chat.collapse}
        >
          ›
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ChatKimi />
      </div>
    </aside>
  );
}
