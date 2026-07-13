"use client";

import { ChatKimi } from "./ChatKimi";
import { UI } from "@/lib/ui-strings";

/**
 * Colonne secondaire droite (`<aside>`) du bloc
 * `02-full-width-secondary-column-on-right` : `fixed right-0`, hors flux.
 * L'espace est réservé côté contenu par le `pr` du CenterPanel (état partagé
 * via `useRailRight`). Repliée → rail vertical de réouverture (w-10).
 */
export function RailRight({ open, toggle }: { open: boolean; toggle: () => void }) {
  if (!open) {
    return (
      <aside
        className="fixed inset-y-0 right-0 z-20 flex w-10 items-start justify-center border-l border-zinc-950/10 bg-white/60 pt-6"
        aria-label={UI.chat.title}
      >
        <button
          type="button"
          onClick={toggle}
          className="rounded-md px-1.5 py-3 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-950/5 hover:text-zinc-900 [writing-mode:vertical-rl]"
        >
          {UI.chat.reopen}
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-20 flex w-[420px] flex-col border-l border-zinc-950/10 bg-white/60 backdrop-blur-xl"
      aria-label={UI.chat.title}
    >
      <div className="flex items-center justify-between border-b border-zinc-950/10 px-4 py-3">
        <span className="text-sm font-semibold text-zinc-900">{UI.chat.title}</span>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-950/5 hover:text-zinc-900"
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
