/**
 * lib/reactivation/types.ts — modèle de la réactivation des prospects dormants.
 *
 * Un « candidat » est un prospect (acquéreur ou propriétaire) sans activité
 * récente au-delà d'un seuil configurable. La détection est DÉTERMINISTE et
 * EXPLICABLE : chaque candidat porte les faits chiffrés qui le font ressortir
 * (jours d'inactivité, dernière activité, biens qui matchent, mandat actif).
 *
 * Aucune communication n'est envoyée ici : le moteur produit au plus un
 * BROUILLON dans l'outbox (status='draft'). Le passage HITL reste obligatoire.
 */

import type { OutboxChannel } from "@/lib/outbox/types";

/** Nature du prospect dormant. */
export type ProspectRole = "acquereur" | "proprietaire";

/** Un fait chiffré qui justifie la sortie du candidat (explicabilité). */
export type ReactivationReason = {
  /** Clé stable (testable), jamais un texte opaque. */
  code:
    | "no_activity_since"
    | "matching_properties"
    | "active_mandate"
    | "active_criteria";
  /** Libellé humain déjà formaté (affiché tel quel). */
  label: string;
};

/** Un bien pertinent cité en indice de relance (acquéreur). */
export type MatchHint = {
  property_id: string;
  title: string | null;
  city: string | null;
  asking_price: number | null;
};

/** Un prospect dormant détecté, avec sa justification complète. */
export type DormantProspect = {
  role: ProspectRole;
  /** Id du lead source (peut être null pour un critère acquéreur sans lead). */
  lead_id: string | null;
  /** Id de la ressource pivot (lead / critère / mandat) — pour la clé React. */
  source_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  /** Jours entiers depuis la dernière activité connue. */
  jours_inactif: number;
  /** Date ISO de la dernière activité retenue. */
  last_activity_at: string;
  /** Faits qui expliquent la sortie (au moins un). */
  reasons: ReactivationReason[];
  /** Biens pertinents (acquéreur) — vide sinon. */
  match_hints: MatchHint[];
  /** Canal recommandé selon la coordonnée dispo (email > whatsapp > sms). */
  suggested_channel: OutboxChannel | null;
};
