// lib/share-tracking/timeline-source.ts — Source ADDITIVE pour la Timeline.
//
// Convertit les événements de partage RÉELS en TimelineEvent, sans toucher au
// moteur d'agrégation partagé (`lib/timeline/aggregate.ts`). L'intégrateur
// ajoutera 'share_open' | 'share_feedback' à `TimelineKind` (voir le diff décrit
// dans le rapport) ; en attendant, on force le kind localement pour rester
// typé sans modifier le fichier partagé.
//
// Ces événements se fondent dans le flux existant : l'appelant les CONCATÈNE aux
// autres sources et laisse `buildTimeline` (ou un simple tri ts desc) les
// intercaler. Aucun événement fantôme : une ligne share_events = un hit réel.

import type { TimelineEvent } from "@/lib/timeline/types";
import type { RawShareEvent } from "./types";

/**
 * Kind attendu côté timeline une fois la source additive branchée. Déclaré ici
 * pour ne pas éditer le type partagé avant le reseed de l'intégrateur.
 */
export type ShareTimelineKind = "share_open" | "share_feedback";

function label(e: RawShareEvent): { title: string; summary: string | null } {
  const what = e.resource_type === "brochure" ? "Brochure" : "Sélection off-market";
  if (e.kind === "share_feedback") {
    return { title: "Retour acquéreur", summary: `${what} · avis laissé` };
  }
  return { title: `${what} consultée`, summary: "Lien partagé ouvert" };
}

function hrefFor(e: RawShareEvent): string | undefined {
  return e.resource_type === "brochure" ? `/estimations/${e.resource_id}` : undefined;
}

/**
 * Mappe des lignes share_events en TimelineEvent. Le `kind` produit est
 * 'share_open' / 'share_feedback' (nouveaux kinds additifs) — casté pour rester
 * compatible avec le type partagé actuel jusqu'à son extension par l'intégrateur.
 */
export function shareEventsToTimeline(events: RawShareEvent[]): TimelineEvent[] {
  return events
    .filter((e) => Number.isFinite(Date.parse(e.ts)))
    .map((e) => {
      const { title, summary } = label(e);
      return {
        ts: e.ts,
        // Le kind additif : voir le diff timeline décrit dans le rapport W5.
        kind: e.kind,
        title,
        summary,
        status: null,
        entityRef: {
          table: "share_events",
          id: e.id,
          href: hrefFor(e),
        },
      } satisfies TimelineEvent;
    });
}
