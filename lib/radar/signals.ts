/**
 * RADAR VENDEURS — calcul PUR des signaux d'opportunité.
 * =================================================================
 * Aucune I/O ici : on reçoit des lignes DB brutes, on renvoie des signaux
 * chiffrés triés par urgence. Testable en isolation sur fixtures.
 *
 * 3 signaux :
 *  - Baisse de prix   ← diff entre versions successives (prosp_annonce_versions)
 *  - Annonce dormante ← ancienneté sans mise à jour (prosp_annonces)
 *  - Mandat expirant  ← proximité de expires_at (mandates)
 */

import {
  PRICE_DROP_MIN_EUR,
  DORMANT_MIN_DAYS,
  MANDATE_EXPIRY_WINDOW_DAYS,
  MANDATE_ACTIVE_STATUSES,
} from "@/config/radar";

const MS_PER_DAY = 86_400_000;

/** Jours entiers écoulés entre `from` et `now` (>= 0, arrondi bas). */
export function daysBetween(from: string | Date, now: Date): number {
  const t = typeof from === "string" ? Date.parse(from) : from.getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / MS_PER_DAY));
}

/** Jours entiers restants avant `to` (peut être négatif si déjà dépassé). */
export function daysUntil(to: string | Date, now: Date): number {
  const t = typeof to === "string" ? Date.parse(to) : to.getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.ceil((t - now.getTime()) / MS_PER_DAY);
}

// ─── Types de sortie ──────────────────────────────────────────────────────────

export type PriceDropSignal = {
  kind: "price_drop";
  annonce_id: string;
  titre: string | null;
  ville: string | null;
  url: string | null;
  prix_actuel: number;
  prix_precedent: number;
  drop_eur: number;
  drop_pct: number; // ‰ arrondi à 0.1 %
  observed_at: string;
};

export type DormantSignal = {
  kind: "dormant";
  annonce_id: string;
  titre: string | null;
  ville: string | null;
  url: string | null;
  prix: number | null;
  jours_dormant: number;
  since: string; // date de référence (date_modif ?? date_publication ?? created_at)
};

export type MandateExpirySignal = {
  kind: "mandate_expiry";
  mandate_id: string;
  reference: string | null;
  kind_label: string;
  property_id: string | null;
  asking_price: number | null;
  jours_restants: number;
  expires_at: string;
};

// ─── Entrées attendues (sous-ensembles des Row DB) ─────────────────────────────

export type AnnonceVersionRow = {
  annonce_id: string;
  prix: number | null;
  observed_at: string;
};

export type AnnonceRow = {
  id: string;
  titre: string | null;
  ville: string | null;
  url: string | null;
  prix: number | null;
  actif: boolean;
  date_modif: string | null;
  date_publication: string | null;
  created_at: string;
};

export type MandateRow = {
  id: string;
  reference: string | null;
  kind: string;
  status: string;
  property_id: string | null;
  asking_price: number | null;
  expires_at: string | null;
};

// ─── Signal 1 : baisses de prix ────────────────────────────────────────────────

/**
 * Détecte les baisses de prix en comparant, par annonce, la version courante
 * (la plus récente) à la version précédente. On ne remonte qu'une baisse
 * effective >= PRICE_DROP_MIN_EUR. `titres` mappe annonce_id → métadonnées.
 */
export function computePriceDrops(
  versions: AnnonceVersionRow[],
  meta: Map<string, Pick<AnnonceRow, "titre" | "ville" | "url">>,
): PriceDropSignal[] {
  const byAnnonce = new Map<string, AnnonceVersionRow[]>();
  for (const v of versions) {
    if (v.prix == null || !Number.isFinite(v.prix)) continue;
    const arr = byAnnonce.get(v.annonce_id) ?? [];
    arr.push(v);
    byAnnonce.set(v.annonce_id, arr);
  }

  const out: PriceDropSignal[] = [];
  for (const [annonceId, arr] of byAnnonce) {
    if (arr.length < 2) continue;
    // tri décroissant par observed_at → [0] = courant, [1] = précédent
    arr.sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at));
    const current = arr[0];
    const previous = arr[1];
    const prixActuel = current.prix as number;
    const prixPrec = previous.prix as number;
    const dropEur = prixPrec - prixActuel;
    if (dropEur < PRICE_DROP_MIN_EUR) continue; // hausse ou stable ou trop faible
    const m = meta.get(annonceId);
    out.push({
      kind: "price_drop",
      annonce_id: annonceId,
      titre: m?.titre ?? null,
      ville: m?.ville ?? null,
      url: m?.url ?? null,
      prix_actuel: prixActuel,
      prix_precedent: prixPrec,
      drop_eur: dropEur,
      drop_pct: prixPrec > 0 ? Math.round((dropEur / prixPrec) * 1000) / 10 : 0,
      observed_at: current.observed_at,
    });
  }
  // urgence = baisse la plus forte en premier
  out.sort((a, b) => b.drop_pct - a.drop_pct || b.drop_eur - a.drop_eur);
  return out;
}

// ─── Signal 2 : annonces dormantes ─────────────────────────────────────────────

/** Date de référence d'ancienneté : date_modif > date_publication > created_at. */
function referenceDate(a: AnnonceRow): string {
  return a.date_modif ?? a.date_publication ?? a.created_at;
}

/**
 * Annonces actives sans mise à jour depuis DORMANT_MIN_DAYS jours.
 * `now` injecté pour tests déterministes.
 */
export function computeDormant(annonces: AnnonceRow[], now: Date): DormantSignal[] {
  const out: DormantSignal[] = [];
  for (const a of annonces) {
    if (!a.actif) continue;
    const since = referenceDate(a);
    const jours = daysBetween(since, now);
    if (jours < DORMANT_MIN_DAYS) continue;
    out.push({
      kind: "dormant",
      annonce_id: a.id,
      titre: a.titre,
      ville: a.ville,
      url: a.url,
      prix: a.prix,
      jours_dormant: jours,
      since,
    });
  }
  out.sort((a, b) => b.jours_dormant - a.jours_dormant);
  return out;
}

// ─── Signal 3 : mandats expirants ──────────────────────────────────────────────

/**
 * Mandats actifs dont expires_at tombe dans les MANDATE_EXPIRY_WINDOW_DAYS
 * jours à venir (inclut les déjà expirés récents → jours_restants < 0).
 */
export function computeMandateExpiries(mandates: MandateRow[], now: Date): MandateExpirySignal[] {
  const active = new Set<string>(MANDATE_ACTIVE_STATUSES);
  const out: MandateExpirySignal[] = [];
  for (const m of mandates) {
    if (!m.expires_at) continue;
    if (!active.has(m.status)) continue;
    const restants = daysUntil(m.expires_at, now);
    if (restants > MANDATE_EXPIRY_WINDOW_DAYS) continue;
    out.push({
      kind: "mandate_expiry",
      mandate_id: m.id,
      reference: m.reference,
      kind_label: m.kind,
      property_id: m.property_id,
      asking_price: m.asking_price,
      jours_restants: restants,
      expires_at: m.expires_at,
    });
  }
  // urgence = échéance la plus proche (ou dépassée) en premier
  out.sort((a, b) => a.jours_restants - b.jours_restants);
  return out;
}
