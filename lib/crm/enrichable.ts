/**
 * lib/crm/enrichable.ts — Garde RGPD enrichissement B2B.
 *
 * ALLOW-LIST volontaire (pas deny-list) : seuls les types pro/societe/sci/agence
 * sont enrichissables. Tout le reste (particulier, null, undefined, valeur
 * inconnue) est REFUSÉ — un `type_personne` manquant ne doit jamais laisser
 * passer un particulier vers un data broker.
 */

export const ENRICHABLE_TYPES = ["professionnel", "societe", "sci", "agence"] as const;

export function isEnrichable(typePersonne: string | null | undefined): boolean {
  return typePersonne != null && (ENRICHABLE_TYPES as readonly string[]).includes(typePersonne);
}
