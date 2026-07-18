// lib/timeline/types.ts — Modèle normalisé de la timeline unifiée.
//
// Chaque événement provient d'une LIGNE DB réelle (visits, estimations,
// estimation_messages, mandates, prosp_envois, prosp_contact_attempts).
// Aucun événement synthétique : pas de ligne DB → pas d'événement.

/** Entité racine dont on agrège l'historique. */
export type TimelineEntity = { type: "lead" | "property"; id: string };

/** Type d'événement — chacun mappe une table réelle. */
export type TimelineKind =
  | "visit" // table visits
  | "estimation" // table estimations (création / valorisation)
  | "estimation_message" // table estimation_messages
  | "mandate" // table mandates (statut / signature)
  | "prosp_envoi" // table prosp_envois (envoi prospection sortant)
  | "contact_attempt" // table prosp_contact_attempts (tentative de contact)
  | "share_open" // table share_events (consultation d'un lien partagé — REA-PRODUCT-008-W5)
  | "share_feedback"; // table share_events (retour acquéreur sur un lien partagé)

/** Référence vers l'entité concrète d'où sort l'événement (navigation). */
export type TimelineEntityRef = {
  table: string;
  id: string;
  href?: string;
};

/** Événement normalisé, prêt à rendre. */
export type TimelineEvent = {
  /** ISO 8601 — l'horodatage réel de l'événement (date de tri). */
  ts: string;
  kind: TimelineKind;
  title: string;
  summary: string | null;
  /** Libellé de statut brut si pertinent (visite planifiée, mandat signé…). */
  status?: string | null;
  entityRef: TimelineEntityRef;
};

/** Lignes brutes minimales lues en base, indépendantes du client PostgREST. */
export type RawVisit = {
  id: string;
  scheduled_at: string;
  created_at: string;
  status: string | null;
  duration_min: number | null;
  feedback: string | null;
  notes: string | null;
  property_id: string | null;
  lead_id: string | null;
};

export type RawEstimation = {
  id: string;
  created_at: string;
  valued_at: string | null;
  updated_at: string | null;
  status: string | null;
  city: string | null;
  market_value: number | null;
  recommended_price: number | null;
  property_id: string | null;
  owner_lead_id: string | null;
};

export type RawEstimationMessage = {
  id: string;
  created_at: string;
  role: string;
  content: string | null;
  estimation_id: string | null;
};

export type RawMandate = {
  id: string;
  created_at: string;
  signed_at: string | null;
  status: string | null;
  kind: string | null;
  reference: string | null;
  asking_price: number | null;
  property_id: string | null;
};

export type RawProspEnvoi = {
  id: string;
  created_at: string;
  sent_at: string | null;
  canal: string;
  statut: string;
  destinataire: string | null;
  error: string | null;
};

export type RawContactAttempt = {
  id: string;
  created_at: string;
  sent_at: string | null;
  canal: string;
  statut: string;
  provider: string | null;
  error: string | null;
  lead_id: string | null;
};

/** Ensemble des lignes brutes agrégées pour une entité. Champs optionnels :
 *  certaines sources ne s'appliquent qu'aux biens (mandats) ou aux leads
 *  (tentatives de contact). */
export type TimelineSources = {
  visits?: RawVisit[];
  estimations?: RawEstimation[];
  estimationMessages?: RawEstimationMessage[];
  mandates?: RawMandate[];
  prospEnvois?: RawProspEnvoi[];
  contactAttempts?: RawContactAttempt[];
};
