"use client";

import { useEffect } from "react";
import { PageStack, PageHeader, Card } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";

export default function LeadsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Pas de clé UI.* générique d'erreur disponible (lib/ui-strings hors de ce lot).
  const title = "Une erreur est survenue"; // strings-lint-allow

  return (
    <PageStack>
      <PageHeader kicker={UI.leads.eyebrow} title={title} />
      <Card>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-600">
            Impossible de charger {UI.leads.title.toLowerCase()}. Réessayez ; si
            le problème persiste, rechargez la page.
          </p>
          {process.env.NODE_ENV === "development" && error.message ? (
            <p className="text-xs text-zinc-500">{error.message}</p>
          ) : null}
          <div>
            <button
              type="button"
              className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-accent-400"
              onClick={reset}
            >
              Réessayer
            </button>
          </div>
        </div>
      </Card>
    </PageStack>
  );
}
