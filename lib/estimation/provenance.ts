/**
 * lib/estimation/provenance.ts — Provenance HONNÊTE des sources d'estimation.
 *
 * PURE, sans IO, sans LLM. Traduit ce qui S'EST RÉELLEMENT PASSÉ dans le
 * pipeline de valorisation en un statut par source, pour que le PDF / partage
 * reflètent la vérité et ne présentent JAMAIS une donnée absente comme certaine.
 *
 * Règle de vérité (mission REA-M04-12) : chaque source porte un statut honnête
 *   - live        : le provider a répondu et a fourni la donnée utilisée.
 *   - snapshot    : donnée servie depuis un instantané persisté (pas un appel
 *                   temps réel), horodatée — vraie mais datée.
 *   - fallback    : le provider primaire a échoué ; une source de secours a
 *                   fourni la donnée (ou une source secondaire remplace).
 *   - unavailable : aucune donnée obtenue de cette source (provider absent,
 *                   erreur, ou zéro résultat). Ne JAMAIS présenter la source
 *                   comme ayant contribué : la brochure l'omet ou l'indique
 *                   explicitement indisponible.
 *
 * Ce module est le point unique consommé par la route /value (construction) et
 * par la brochure/PDF (affichage). Aucune autre couche ne doit inventer un
 * libellé de source « toujours présent ».
 */

// ─── Statut ────────────────────────────────────────────────────────────────

export const PROVIDER_STATUSES = ["live", "snapshot", "fallback", "unavailable"] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

/** Un provider mesuré dans le pipeline. Clé stable = auditabilité. */
export type ProviderKey =
  | "geocode" // BAN / Géoplateforme IGN
  | "cadastre" // apicarto IGN
  | "dvf" // Demandes de Valeurs Foncières (Etalab)
  | "ademe" // DPE open data ADEME
  | "listings" // annonces marché actif (Apify / MySwarms)
  | "market_context"; // contexte quartier (recherche web, hors calcul de prix)

/**
 * Provenance d'UNE source. `detail` est un compteur/label neutre (jamais de
 * PII, jamais de secret) : nb de comparables, nom de la source de secours, etc.
 */
export type ProviderProvenance = {
  key: ProviderKey;
  /** Libellé humain de la source, tel qu'affiché dans la brochure. */
  label: string;
  status: ProviderStatus;
  /** Compteur d'échantillons réellement retenus (ex. nb ventes DVF). null si non pertinent. */
  count: number | null;
  /**
   * Précision courte et neutre (ex. « BAN », « Géoplateforme IGN (secours) »,
   * « LeBonCoin », « aucune vente comparable »). JAMAIS de donnée nominative.
   */
  detail: string | null;
};

// ─── Libellés stables ────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  geocode: "Géocodage",
  cadastre: "Cadastre IGN",
  dvf: "Ventes DVF (Etalab)",
  ademe: "DPE ADEME",
  listings: "Marché actif",
  market_context: "Contexte quartier",
};

/** Libellé humain du statut, pour la brochure (FR, neutre). */
const STATUS_LABELS: Record<ProviderStatus, string> = {
  live: "à jour",
  snapshot: "instantané",
  fallback: "source de secours",
  unavailable: "indisponible",
};

export function providerLabel(key: ProviderKey): string {
  return PROVIDER_LABELS[key];
}

export function statusLabel(status: ProviderStatus): string {
  return STATUS_LABELS[status];
}

/** Un statut « a réellement contribué » (à afficher comme source active). */
export function contributed(status: ProviderStatus): boolean {
  return status === "live" || status === "snapshot" || status === "fallback";
}

// ─── Construction ────────────────────────────────────────────────────────────

/**
 * Entrées mesurées pendant une passe de valorisation. Chaque champ décrit
 * FACTUELLEMENT le résultat obtenu — pas une intention.
 */
export type ProvenanceInput = {
  /** Géocodage : `null` = échec total ; sinon `primary` (BAN) ou `fallback` (Géoplateforme). */
  geocode: null | { via: "primary" | "fallback" };
  /** Cadastre : parcelle résolue ou non (sert au ciblage des sections DVF). */
  cadastreResolved: boolean;
  /** DVF : nombre de comparables réellement retenus (0 = aucune donnée exploitable). */
  dvfComparables: number;
  /**
   * DPE : `null` = non résolu (ni fourni, ni trouvé) ; `provided` = fourni par
   * le vendeur (pas un appel ADEME) ; `ademe` = résolu via ADEME open data.
   */
  dpe: null | { via: "provided" | "ademe" };
  /**
   * Annonces : source réelle renvoyée par fetchListingComparables.
   * `count` = nb d'annonces retenues ; `fallbackUsed` = un secours a servi.
   */
  listings: { source: "apify" | "myswarms" | "none"; count: number; fallbackUsed: boolean };
};

const LISTINGS_SOURCE_LABEL: Record<"apify" | "myswarms" | "none", string> = {
  apify: "LeBonCoin",
  myswarms: "Bienici",
  none: "aucune annonce",
};

/**
 * Dérive la provenance HONNÊTE d'une passe de valorisation.
 * Déterministe : mêmes entrées → même sortie. Ordre stable (auditabilité).
 */
export function buildProvenance(input: ProvenanceInput): ProviderProvenance[] {
  const out: ProviderProvenance[] = [];

  // ── Géocodage ──────────────────────────────────────────────────────────
  if (input.geocode === null) {
    out.push({
      key: "geocode",
      label: PROVIDER_LABELS.geocode,
      status: "unavailable",
      count: null,
      detail: "adresse introuvable",
    });
  } else {
    out.push({
      key: "geocode",
      label: PROVIDER_LABELS.geocode,
      status: input.geocode.via === "fallback" ? "fallback" : "live",
      count: null,
      detail: input.geocode.via === "fallback" ? "Géoplateforme IGN (secours)" : "BAN",
    });
  }

  // ── Cadastre ───────────────────────────────────────────────────────────
  out.push({
    key: "cadastre",
    label: PROVIDER_LABELS.cadastre,
    status: input.cadastreResolved ? "live" : "unavailable",
    count: null,
    detail: input.cadastreResolved ? "parcelle résolue" : "parcelle non résolue",
  });

  // ── DVF ────────────────────────────────────────────────────────────────
  out.push({
    key: "dvf",
    label: PROVIDER_LABELS.dvf,
    status: input.dvfComparables > 0 ? "live" : "unavailable",
    count: input.dvfComparables,
    detail:
      input.dvfComparables > 0
        ? `${input.dvfComparables} vente${input.dvfComparables > 1 ? "s" : ""} comparable${input.dvfComparables > 1 ? "s" : ""}`
        : "aucune vente comparable",
  });

  // ── DPE ADEME ──────────────────────────────────────────────────────────
  if (input.dpe === null) {
    out.push({
      key: "ademe",
      label: PROVIDER_LABELS.ademe,
      status: "unavailable",
      count: null,
      detail: "DPE non renseigné",
    });
  } else if (input.dpe.via === "provided") {
    // Fourni par le vendeur : ADEME n'a PAS été la source → on n'affiche pas
    // ADEME comme contributeur, on trace juste que le DPE vient du dossier.
    out.push({
      key: "ademe",
      label: PROVIDER_LABELS.ademe,
      status: "unavailable",
      count: null,
      detail: "DPE fourni au dossier (hors ADEME)",
    });
  } else {
    out.push({
      key: "ademe",
      label: PROVIDER_LABELS.ademe,
      status: "live",
      count: null,
      detail: "classe résolue via ADEME",
    });
  }

  // ── Annonces marché actif ──────────────────────────────────────────────
  if (input.listings.source === "none" || input.listings.count === 0) {
    out.push({
      key: "listings",
      label: PROVIDER_LABELS.listings,
      status: "unavailable",
      count: 0,
      detail: "aucune annonce détectée",
    });
  } else {
    out.push({
      key: "listings",
      label: PROVIDER_LABELS.listings,
      status: input.listings.fallbackUsed ? "fallback" : "live",
      count: input.listings.count,
      detail: input.listings.fallbackUsed
        ? `${LISTINGS_SOURCE_LABEL[input.listings.source]} (secours)`
        : LISTINGS_SOURCE_LABEL[input.listings.source],
    });
  }

  return out;
}

// ─── Lecture défensive (persistance ↔ affichage) ─────────────────────────────

function isStatus(v: unknown): v is ProviderStatus {
  return typeof v === "string" && (PROVIDER_STATUSES as readonly string[]).includes(v);
}

/**
 * Parse une valeur JSON persistée (issue de sources_snapshot.provenance) en
 * `ProviderProvenance[]` sûr. Toute entrée mal formée est écartée plutôt que
 * de casser le rendu du PDF. `null`/absent → [].
 */
export function parseProvenance(raw: unknown): ProviderProvenance[] {
  if (!Array.isArray(raw)) return [];
  const out: ProviderProvenance[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.key !== "string") continue;
    if (!isStatus(rec.status)) continue;
    out.push({
      key: rec.key as ProviderKey,
      label: typeof rec.label === "string" ? rec.label : PROVIDER_LABELS[rec.key as ProviderKey] ?? rec.key,
      status: rec.status,
      count: typeof rec.count === "number" ? rec.count : null,
      detail: typeof rec.detail === "string" ? rec.detail : null,
    });
  }
  return out;
}
