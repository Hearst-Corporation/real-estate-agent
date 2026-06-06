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

/** Nombre de jours entiers écoulés depuis une date ISO. null si pas de date. */
export function daysSince(d: string | null | undefined): number | null {
  if (!d) return null;
  const MS_PER_DAY = 86_400_000;
  return Math.floor((Date.now() - new Date(d).getTime()) / MS_PER_DAY);
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

export const MANDATE_KINDS = ["simple", "exclusif", "semi_exclusif"] as const;
export type MandateKind = (typeof MANDATE_KINDS)[number];

// ─── Énumérations Leads (valeurs CHECK constraints DB) ────────────────────────

export const LEAD_KINDS = ["acheteur", "vendeur"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

export const LEAD_TYPE_PERSONNE = [
  "particulier",
  "professionnel",
  "societe",
  "sci",
  "agence",
] as const;
export type LeadTypePersonne = (typeof LEAD_TYPE_PERSONNE)[number];

// Valeurs par défaut des formulaires (évitent les littéraux dupliqués state/JSX).
export const LEAD_DEFAULT_KIND: LeadKind = "acheteur";
export const LEAD_DEFAULT_TYPE_PERSONNE: LeadTypePersonne = "particulier";
export const LEAD_DEFAULT_STATUS: LeadStatus = "nouveau";

// ─── Bornes de validation des formulaires ─────────────────────────────────────

export const FORM_LIMITS = {
  /** Prix / budget : pas de montant négatif. */
  priceMin: 0,
  /** Commission mandat en %. */
  commissionMin: 0,
  commissionMax: 100,
  commissionStep: 0.01,
  /** Durée d'une visite en minutes. */
  visitDurationDefault: 30,
  visitDurationMin: 5,
  visitDurationMax: 480,
  visitDurationStep: 5,
  /** Hauteur par défaut des textarea (nb de lignes). */
  textareaRows: 3,
} as const;
