"use client";

import { useEffect } from "react";
import { PageStack, PageHeader, Card } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";

export default function MissionsError({
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
      <PageHeader kicker={UI.missions.kicker} title={title} />
      <Card>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-300">
            Impossible de charger {UI.nav.missions.toLowerCase()}. Réessayez ; si
            le problème persiste, rechargez la page.
          </p>
          {process.env.NODE_ENV === "development" && error.message ? (
            <p className="text-xs text-slate-500">{error.message}</p>
          ) : null}
          <div>
            <button
              type="button"
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
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
