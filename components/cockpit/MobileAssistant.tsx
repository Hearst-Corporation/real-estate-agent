"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatBubbleLeftRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ChatKimi } from "./ChatKimi";
import { UI } from "@/lib/ui-strings";

/**
 * Accès mobile à l'assistant.
 *
 * Sur desktop l'assistant vit dans la colonne droite `fixed` (RailRight), mais
 * celle-ci est masquée sous `sm` (le contenu métier occupe toute la largeur du
 * petit écran). Sans point d'entrée mobile, l'assistant serait donc INACCESSIBLE
 * sur téléphone. Ce composant `sm:hidden` ajoute :
 *   - un bouton flottant (FAB) au-dessus de la bottom bar,
 *   - une feuille plein écran (dialog modale) hébergeant le même <ChatKimi/>,
 *     avec fermeture Échap / fond, verrou de scroll du body, et gestion du focus
 *     (focus sur l'input à l'ouverture, retour au FAB à la fermeture).
 *
 * Le chat n'est monté que lorsque la feuille est ouverte → aucune session
 * dupliquée avec le panneau desktop, et l'état repart propre à chaque ouverture.
 */
export function MobileAssistant() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Échap ferme + verrou de scroll du body pendant l'ouverture.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  // Focus : à l'ouverture on cible le champ de saisie du chat (pour taper tout
  // de suite) ; à défaut, le premier élément focusable de la feuille. À la
  // fermeture on rend le focus au FAB (continuité clavier, pas de focus perdu).
  useEffect(() => {
    if (open) {
      const panel = panelRef.current;
      const target =
        panel?.querySelector<HTMLElement>("input, textarea") ??
        panel?.querySelector<HTMLElement>(
          "button, [href], [tabindex]:not([tabindex='-1'])",
        );
      target?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [open]);

  return (
    <div className="sm:hidden">
      {!open && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={UI.chat.title}
          className="fixed bottom-20 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-accent-600 text-white shadow-[var(--shadow-hero)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:scale-95"
        >
          <ChatBubbleLeftRightIcon className="size-6" aria-hidden="true" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col">
          {/* Fond cliquable pour fermer (couche sous la feuille). */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={close}
            className="absolute inset-0 -z-10 h-full w-full bg-zinc-950/30 backdrop-blur-sm"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={UI.chat.title}
            className="flex h-full w-full flex-col bg-lin-brut"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-950/10 px-4 py-3">
              <span className="text-sm font-semibold text-zinc-900">{UI.chat.title}</span>
              <button
                type="button"
                onClick={close}
                aria-label={UI.chat.collapse}
                className="flex size-9 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-950/5 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
              >
                <XMarkIcon className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ChatKimi />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
