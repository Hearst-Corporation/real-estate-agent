// lib/share-tracking/types.ts — Modèle du suivi des partages (brochure / off-market).
//
// Un événement de partage = un HIT SERVEUR RÉEL sur une route publique portée
// par un token signé. Aucune valeur inventée : chaque ligne vient d'un handler
// de route publique, après vérification de la signature du token.

/** Ressource partagée via un lien token. */
export type ShareResourceType = "brochure" | "offmarket";

/** Nature de l'événement observé côté serveur. */
export type ShareEventKind = "share_open" | "share_feedback";

/** Une ressource partagée déjà résolue (token vérifié → id + tenant). */
export interface ShareResource {
  type: ShareResourceType;
  /** id de l'estimation (brochure) ou de la sélection (off-market). */
  id: string;
  /** tenant propriétaire de la ressource — pour l'isolation multi-tenant. */
  tenantId: string;
}

/** Entrée d'enregistrement d'un événement (déjà borné à une ressource vérifiée). */
export interface RecordShareEventInput {
  resource: ShareResource;
  kind: ShareEventKind;
  /** Le token opaque en clair — jamais persisté tel quel, seulement haché. */
  token: string;
  /** IP brute optionnelle — jamais persistée telle quelle, seulement hachée. */
  ip?: string | null;
}

/** Résultat d'un enregistrement — jamais bloquant pour la route publique. */
export type RecordOutcome =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "not_configured" | "error" };

/** Ligne brute lue en base pour l'agrégation Timeline. */
export interface RawShareEvent {
  id: string;
  resource_type: ShareResourceType;
  resource_id: string;
  kind: ShareEventKind;
  ts: string;
}

/** Résumé du suivi d'une ressource partagée (pour le centre d'actions). */
export interface ShareTrackingSummary {
  resourceType: ShareResourceType;
  resourceId: string;
  opens: number;
  feedbacks: number;
  firstAt: string | null;
  lastAt: string | null;
}
