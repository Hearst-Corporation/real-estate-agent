// lib/timeline/aggregate.ts — Normalisation + tri PURS (aucune I/O, testable sur fixtures).
//
// Transforme les lignes brutes hétérogènes en un flux TimelineEvent unique
// trié par date décroissante. La date de tri est l'horodatage RÉEL de
// l'événement (scheduled_at pour une visite, valued_at/created_at pour une
// estimation, signed_at/created_at pour un mandat, sent_at/created_at pour un
// envoi), jamais une valeur inventée.

import type {
  RawContactAttempt,
  RawEstimation,
  RawEstimationMessage,
  RawMandate,
  RawProspEnvoi,
  RawVisit,
  TimelineEvent,
  TimelineSources,
} from "./types";

/** Coupe proprement un texte libre pour un résumé. */
function excerpt(text: string | null | undefined, max = 160): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Format euros compact et déterministe (pas de dépendance i18n runtime). */
function euros(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

function visitToEvent(v: RawVisit): TimelineEvent {
  const parts: string[] = [];
  if (v.duration_min) parts.push(`${v.duration_min} min`);
  const detail = excerpt(v.feedback ?? v.notes);
  if (detail) parts.push(detail);
  return {
    ts: v.scheduled_at || v.created_at,
    kind: "visit",
    title: "Visite",
    summary: parts.length ? parts.join(" · ") : null,
    status: v.status,
    entityRef: { table: "visits", id: v.id, href: "/visits" },
  };
}

function estimationToEvent(e: RawEstimation): TimelineEvent {
  const price = euros(e.recommended_price ?? e.market_value);
  const summaryParts: string[] = [];
  if (e.city) summaryParts.push(e.city);
  if (price) summaryParts.push(price);
  const valued = Boolean(e.valued_at);
  return {
    ts: e.valued_at || e.created_at,
    kind: "estimation",
    title: valued ? "Estimation valorisée" : "Estimation créée",
    summary: summaryParts.length ? summaryParts.join(" · ") : null,
    status: e.status,
    entityRef: { table: "estimations", id: e.id, href: `/estimations/${e.id}` },
  };
}

function estimationMessageToEvent(m: RawEstimationMessage): TimelineEvent {
  const who = m.role === "assistant" ? "Assistant" : m.role === "user" ? "Vous" : m.role;
  return {
    ts: m.created_at,
    kind: "estimation_message",
    title: `Message estimation (${who})`,
    summary: excerpt(m.content),
    status: m.role,
    entityRef: {
      table: "estimation_messages",
      id: m.id,
      href: m.estimation_id ? `/estimations/${m.estimation_id}` : undefined,
    },
  };
}

function mandateToEvent(m: RawMandate): TimelineEvent {
  const signed = Boolean(m.signed_at);
  const summaryParts: string[] = [];
  if (m.reference) summaryParts.push(m.reference);
  if (m.kind) summaryParts.push(m.kind);
  const price = euros(m.asking_price);
  if (price) summaryParts.push(price);
  return {
    ts: m.signed_at || m.created_at,
    kind: "mandate",
    title: signed ? "Mandat signé" : "Mandat créé",
    summary: summaryParts.length ? summaryParts.join(" · ") : null,
    status: m.status,
    entityRef: { table: "mandates", id: m.id, href: "/mandates" },
  };
}

function prospEnvoiToEvent(p: RawProspEnvoi): TimelineEvent {
  const summaryParts: string[] = [];
  if (p.canal) summaryParts.push(p.canal);
  if (p.destinataire) summaryParts.push(p.destinataire);
  if (p.error) summaryParts.push(`erreur: ${excerpt(p.error, 80)}`);
  return {
    ts: p.sent_at || p.created_at,
    kind: "prosp_envoi",
    title: "Envoi prospection",
    summary: summaryParts.length ? summaryParts.join(" · ") : null,
    status: p.statut,
    entityRef: { table: "prosp_envois", id: p.id },
  };
}

function contactAttemptToEvent(c: RawContactAttempt): TimelineEvent {
  const summaryParts: string[] = [];
  if (c.canal) summaryParts.push(c.canal);
  if (c.provider) summaryParts.push(c.provider);
  if (c.error) summaryParts.push(`erreur: ${excerpt(c.error, 80)}`);
  return {
    ts: c.sent_at || c.created_at,
    kind: "contact_attempt",
    title: "Tentative de contact",
    summary: summaryParts.length ? summaryParts.join(" · ") : null,
    status: c.statut,
    entityRef: { table: "prosp_contact_attempts", id: c.id },
  };
}

/**
 * Agrège toutes les sources en un flux unique trié par date décroissante.
 * Une ligne sans horodatage exploitable est écartée (aucun événement fantôme).
 *
 * @param sources lignes brutes déjà scopées (owner-check fait par l'appelant)
 * @param limit   nombre max d'événements renvoyés (défaut 100)
 */
export function buildTimeline(sources: TimelineSources, limit = 100): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const v of sources.visits ?? []) events.push(visitToEvent(v));
  for (const e of sources.estimations ?? []) events.push(estimationToEvent(e));
  for (const m of sources.estimationMessages ?? []) events.push(estimationMessageToEvent(m));
  for (const m of sources.mandates ?? []) events.push(mandateToEvent(m));
  for (const p of sources.prospEnvois ?? []) events.push(prospEnvoiToEvent(p));
  for (const c of sources.contactAttempts ?? []) events.push(contactAttemptToEvent(c));

  const withTs = events.filter((e) => {
    const t = Date.parse(e.ts);
    return Number.isFinite(t);
  });

  withTs.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

  const clamped = Math.max(1, Math.min(limit, 500));
  return withTs.slice(0, clamped);
}
