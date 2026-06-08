"use client";

import { useEffect } from "react";
import { PageStack, PageHeader, Card } from "@/components/cockpit/primitives";

/**
 * Frontière d'erreur du segment (dashboard). Client component obligatoire
 * (signature Next : { error, reset }). Aucun appel serveur ici.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Trace côté client ; Sentry capte déjà via l'instrumentation globale.
    console.error(error);
  }, [error]);

  // Pas de clé UI.* générique d'erreur disponible (lib/ui-strings hors de ce lot).
  const title = "Une erreur est survenue"; // strings-lint-allow

  return (
    <PageStack>
      <PageHeader kicker="Cockpit" title={title} />
      <Card>
        <div className="ct-skeleton-stack">
          <p className="ct-sub">
            Quelque chose s'est mal passé en chargeant cette vue. Réessayez ;
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
