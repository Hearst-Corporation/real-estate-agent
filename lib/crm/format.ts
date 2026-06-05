/**
 * Helpers de formatage CRM — purs, zéro dépendance React/Cockpit.
 */

// ─── Formatage numérique & date ───────────────────────────────────────────────

const EUR_FMT = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Formate un montant en euros (fr-FR). Retourne "—" si null, undefined ou 0. */
export function eur(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return EUR_FMT.format(n);
}

/** Formate une surface en m². Retourne "—" si null/undefined/0. */
export function sqm(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return `${n} m²`;
}

/** Formate une date ISO en toLocaleDateString fr-FR. Retourne "—" si null/undefined. */
export function dateFr(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR");
}

/** Formate une date ISO en date + heure HH:mm fr-FR. Retourne "—" si null/undefined. */
export function dateTimeFr(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Formate uniquement l'heure HH:mm depuis une date ISO (fr-FR). */
export function timeFr(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Listes de statuts (valeurs CHECK constraints DB) ─────────────────────────

export const PROPERTY_STATUSES = [
  "prospect",
  "estimation",
  "mandat",
  "en_vente",
  "sous_offre",
  "vendu",
  "archive",
] as const;

export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const LEAD_STATUSES = [
  "nouveau",
  "contacte",
  "qualifie",
  "visite",
  "offre",
  "gagne",
  "perdu",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const VISIT_STATUSES = [
  "planifiee",
  "confirmee",
  "realisee",
  "annulee",
  "no_show",
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const MANDATE_STATUSES = [
  "brouillon",
  "actif",
  "suspendu",
  "expire",
  "resilie",
  "realise",
] as const;

export type MandateStatus = (typeof MANDATE_STATUSES)[number];
