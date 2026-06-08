"use client";

import { useEffect } from "react";
import { PageStack, PageHeader, Card } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";

export default function EstimationsError({
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
      <PageHeader kicker={UI.estimations.eyebrow} title={title} />
      <Card>
        <div className="ct-skeleton-stack">
          <p className="ct-sub">
            Impossible de charger {UI.estimations.title.toLowerCase()}. Réessayez ;
            si le problème persiste, rechargez la page.
          </p>
          {process.env.NODE_ENV === "development" && error.message ? (
            <p className="ct-subtext">{error.message}</p>
          ) : null}
          <div>
            <button type="button" className="ct-btn ct-btn-primary" onClick={reset}>
              Réessayer
            </button>
          </div>
        </div>
      </Card>
    </PageStack>
  );
}
