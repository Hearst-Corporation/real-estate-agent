/**
 * statusTone — mappe entité + statut vers une tonalité CSS .crm-status.
 *
 * Tonalités :
 *   "is-positive"  → gagné / vendu / réalisé / actif / réalisée / confirmée
 *   "is-negative"  → perdu / annulée / résilié / expiré / archivé / no_show
 *   "is-pending"   → tout le reste
 */

export type StatusTone = "is-positive" | "is-negative" | "is-pending";

type Entity = "property" | "lead" | "visit" | "mandate" | "estimation";

const POSITIVE: Record<Entity, readonly string[]> = {
  property: ["vendu", "en_vente"],
  lead: ["gagne"],
  visit: ["realisee", "confirmee"],
  mandate: ["actif", "realise"],
  estimation: ["ready"],
};

const NEGATIVE: Record<Entity, readonly string[]> = {
  property: ["archive"],
  lead: ["perdu"],
  visit: ["annulee", "no_show"],
  mandate: ["expire", "resilie"],
  estimation: ["archived"],
};

/**
 * Retourne la tonalité CSS pour un statut donné sur une entité CRM.
 *
 * @param entity  "property" | "lead" | "visit" | "mandate"
 * @param status  valeur exacte du champ `status` en base
 */
export function statusTone(entity: Entity, status: string): StatusTone {
  if (POSITIVE[entity].includes(status)) return "is-positive";
  if (NEGATIVE[entity].includes(status)) return "is-negative";
  return "is-pending";
}
