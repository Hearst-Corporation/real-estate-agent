// lib/share-tracking/index.ts — Point d'entrée du suivi des partages (W5).
//
// Trace les événements RÉELS sur les liens token (brochure, off-market) :
// ouverture/consultation (share_open), retour acquéreur (share_feedback).
// Un événement = un HIT SERVEUR RÉEL sur la route publique, jamais inventé.

export {
  recordShareEvent,
  fetchShareEvents,
  summarizeShareEvents,
} from "./db";
export { hashToken, hashValue } from "./hash";
export { shareEventsToTimeline } from "./timeline-source";
export type { ShareTimelineKind } from "./timeline-source";
export type {
  ShareResourceType,
  ShareEventKind,
  ShareResource,
  RecordShareEventInput,
  RecordOutcome,
  RawShareEvent,
  ShareTrackingSummary,
} from "./types";
