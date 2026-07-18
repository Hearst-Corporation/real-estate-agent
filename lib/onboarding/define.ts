/**
 * `defineTour` — fabrique isolée d'une définition de tour.
 *
 * Vit dans son propre module (et non dans `tours.ts`) pour casser le cycle
 * d'import : `tours.ts` importe TOUS les fichiers `tours/*.ts`, qui eux-mêmes
 * ont besoin de `defineTour`. Importer la fabrique depuis ici — un module sans
 * dépendance de registre — évite la TDZ au build (Cannot access '…' before
 * initialization sur les pages qui consomment une ancre de tour).
 */
import { validateTour } from "./progress";
import type { TourDefinition } from "./types";

export function defineTour(def: TourDefinition): TourDefinition {
  const problems = validateTour(def);
  if (problems.length > 0 && process.env.NODE_ENV !== "production") {
    throw new Error(`Tour « ${def.key} » invalide :\n  - ${problems.join("\n  - ")}`);
  }
  return def;
}
