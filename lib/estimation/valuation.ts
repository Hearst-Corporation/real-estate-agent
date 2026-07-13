/**
 * Moteur de valorisation — PURE function, AUCUN IO, AUCUN LLM.
 *
 * Méthodologie :
 * 1. Base €/m² = médiane des comparables DVF INDEXÉS (indexComparable).
 * 2. Ajustements multiplicatifs % par axe (DPE, étage/asc, exposition,
 *    état général, cachet, charges/travaux/occupation).
 *    Clamp total ±25 %.
 * 3. Core value = adjustedPerM2 × surface habitable.
 * 4. Annexes en € absolu hors clamp (parking, cave, terrasse, jardin, terrain).
 * 5. Fourchette selon confidence spread.
 */

import type {
  PropertyData,
  DvfComparable,
  Valuation,
  ValuationAdjustment,
  ConfidenceFactors,
  DataStatus,
} from './types';
import { indexComparable } from './price-index';

/**
 * Version du moteur de valorisation (semver). À incrémenter dès que la
 * méthodologie (tables d'ajustement, clamp, annexes, indexation) change, pour
 * qu'une estimation persistée reste rejouable/auditable.
 *   patch : correction sans effet sur les valeurs produites
 *   minor : nouvel axe d'ajustement / facteurs de confiance (rétro-compatible)
 *   major : changement de méthode qui déplace les valeurs
 */
export const ENGINE_VERSION = 'valuation@1.1.0';

// ─── Median ───────────────────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ─── Confidence factors ───────────────────────────────────────────────────────

/** Moyenne arithmétique, null si tableau vide. */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Coefficient de variation (écart-type population / médiane) des prix/m² indexés.
 * Mesure la dispersion : plus il est bas, plus le marché est homogène et
 * l'estimation fiable. null si <2 comps ou médiane nulle.
 */
function coeffVariation(prices: number[]): number | null {
  if (prices.length < 2) return null;
  const med = median(prices);
  if (med === null || med === 0) return null;
  const m = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance =
    prices.reduce((acc, p) => acc + (p - m) ** 2, 0) / prices.length;
  return Math.sqrt(variance) / med;
}

/**
 * Ancienneté moyenne des mutations (en mois) par rapport à `now`.
 * `now` injecté pour rester déterministe (défaut = dernier trimestre indexé
 * si non fourni ; ici on prend `Date.now` UNIQUEMENT si aucune date de réf.
 * n'est passée — le calcul reste pur tant que l'appelant fournit `refNowIso`).
 */
function recenceMoyenneMois(
  comps: DvfComparable[],
  refNowIso: string | undefined,
): number | null {
  if (comps.length === 0) return null;
  const ref = refNowIso ? new Date(refNowIso) : null;
  if (ref === null || Number.isNaN(ref.getTime())) return null;
  const monthsList: number[] = [];
  for (const c of comps) {
    const d = new Date(c.date_mutation);
    if (Number.isNaN(d.getTime())) continue;
    const months =
      (ref.getUTCFullYear() - d.getUTCFullYear()) * 12 +
      (ref.getUTCMonth() - d.getUTCMonth());
    monthsList.push(Math.max(0, months));
  }
  const avg = mean(monthsList);
  return avg === null ? null : Math.round(avg * 10) / 10;
}

// ─── DPE adjustment tables ────────────────────────────────────────────────────

const DPE_APPART: Record<string, number> = {
  A: 16, B: 12, C: 6, D: 0, E: -7, F: -10, G: -12,
};

const DPE_MAISON: Record<string, number> = {
  A: 17, B: 11, C: 5, D: 0, E: -11, F: -18, G: -25,
};

function dpeTable(typeBien: PropertyData['type_bien']): Record<string, number> {
  return typeBien === 'maison' ? DPE_MAISON : DPE_APPART;
}

/**
 * Déduit la classe DPE dominante du mix de comparables.
 * Heuristique : on n'a pas le DPE de chaque comp DVF → on suppose D par défaut.
 * Si compDpeMix fourni (ex: "D" ou "C-D" = classe moyenne constatée), on l'utilise.
 */
function resolveBaseDpeClasse(compDpeMix: string | null | undefined): string {
  if (!compDpeMix) return 'D';
  // Prend la première lettre valide trouvée
  const match = compDpeMix.trim().toUpperCase().match(/[A-G]/);
  return match ? match[0] : 'D';
}

// ─── Clamp helpers ────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ─── Charges seuil (€/m²/an) ─────────────────────────────────────────────────
// Seuil : charges annuelles > 35 €/m² = "élevées" (Paris ~25-30, province ~15-20)

const CHARGES_PAR_M2_SEUIL = 35;

// ─── Cachet / standing heuristique ───────────────────────────────────────────

function detectCachet(property: PropertyData): {
  hautPlafond: boolean;
  standing: 'normal' | 'haut_de_gamme' | 'luxe';
} {
  const hautPlafond =
    property.hauteur_sous_plafond_m !== null &&
    property.hauteur_sous_plafond_m > 3;

  const style = (property.standing_style ?? '').toLowerCase();
  const prestations = (property.prestations ?? []).map((p) => p.toLowerCase());

  const isLuxe =
    style.includes('luxe') ||
    style.includes('prestige') ||
    prestations.some((p) => p.includes('luxe') || p.includes('prestige') || p.includes('marbr'));

  const isHautDeGamme =
    !isLuxe &&
    (style.includes('haut de gamme') ||
      style.includes('haut-de-gamme') ||
      style.includes('standing') ||
      prestations.some(
        (p) =>
          p.includes('parquet massif') ||
          p.includes('pierre') ||
          p.includes('haussmann') ||
          p.includes('moulure') ||
          p.includes('cheminee') ||
          p.includes('cheminée'),
      ));

  const standing = isLuxe
    ? 'luxe'
    : isHautDeGamme
    ? 'haut_de_gamme'
    : 'normal';

  return { hautPlafond, standing };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function computeValuation(
  property: PropertyData,
  comparables: DvfComparable[],
  opts: {
    medianPricePerSqm: number | null;
    confidence: 'indicative' | 'moyenne' | 'elevee';
    compDpeMix?: string | null;
    /** ISO de référence (= market.fetched_at) pour la récence des comps. Garde le calcul pur. */
    refNowIso?: string;
    /** Distance moyenne (km) des comps, calculée en amont (comparables.ts). */
    distanceMoyenneKm?: number | null;
    /** Géocodage du bien réussi (pilote data_status). Défaut : true si des comps existent. */
    geocoded?: boolean;
  },
): Valuation {
  const adjustments: ValuationAdjustment[] = [];

  // ── 1. Base €/m² via comps INDEXÉS ───────────────────────────────────────

  const indexedComps = comparables.map(indexComparable);
  const prices = indexedComps.map((c) => c.prix_m2).filter((p) => p > 0);
  const computedMedian = median(prices);

  // ── Facteurs de confiance mesurables (explicabilité) ─────────────────────
  const cvRaw = coeffVariation(prices);
  const confidenceFactors: ConfidenceFactors = {
    nbComparables: comparables.length,
    cvPrixM2: cvRaw === null ? null : Math.round(cvRaw * 1000) / 1000,
    distanceMoyenneKm:
      opts.distanceMoyenneKm === undefined || opts.distanceMoyenneKm === null
        ? null
        : Math.round(opts.distanceMoyenneKm * 100) / 100,
    recenceMoyenneMois: recenceMoyenneMois(comparables, opts.refNowIso),
  };

  // ── data_status : dérivé géoloc + nb comps ───────────────────────────────
  // complete : géoloc OK + DVF + ≥3 comparables
  // partial  : géoloc OK mais <3 comparables
  // degraded : géoloc échouée / 0 comparable
  const geocoded = opts.geocoded ?? comparables.length > 0;
  const dataStatus: DataStatus =
    !geocoded || comparables.length === 0
      ? 'degraded'
      : comparables.length >= 3
        ? 'complete'
        : 'partial';

  // Priorité : médiane calculée sur les comps indexés, sinon medianPricePerSqm fourni
  const basePerM2Raw = computedMedian ?? opts.medianPricePerSqm ?? 0;

  if (basePerM2Raw === 0 || comparables.length === 0) {
    // Mode dégradé : pas de données de marché
    return {
      basePerM2: 0,
      adjustedPerM2: 0,
      adjustments: [],
      lowValue: 0,
      marketValue: 0,
      highValue: 0,
      recommendedListingPrice: 0,
      confidence: 'indicative',
      nbComparables: 0,
      engineVersion: ENGINE_VERSION,
      confidenceFactors: {
        nbComparables: 0,
        cvPrixM2: null,
        distanceMoyenneKm: null,
        recenceMoyenneMois: null,
      },
      dataStatus: 'degraded',
    };
  }

  const basePerM2 = Math.round(basePerM2Raw);

  // ── 2. Ajustements multiplicatifs ────────────────────────────────────────

  let totalPct = 0;

  const pushAdj = (adj: ValuationAdjustment) => {
    adjustments.push(adj);
    totalPct += adj.pct;
  };

  // ── 2a. DPE ──────────────────────────────────────────────────────────────
  const dpeClasse = property.dpe_classe;
  if (dpeClasse) {
    const table = dpeTable(property.type_bien);
    const baseDpe = resolveBaseDpeClasse(opts.compDpeMix);
    const subjectPct = table[dpeClasse] ?? 0;
    const basePct = table[baseDpe] ?? 0;
    const dpePct = subjectPct - basePct;

    if (dpePct !== 0) {
      pushAdj({
        label: `DPE ${dpeClasse}`,
        type: dpePct > 0 ? 'premium' : 'discount',
        pct: dpePct,
        rationale: `Classe énergétique ${dpeClasse} vs base comps ${baseDpe} (${dpePct > 0 ? '+' : ''}${dpePct}%)`,
      });
    }
  }

  // ── 2b. Étage × ascenseur ─────────────────────────────────────────────
  // S'applique uniquement aux appartements
  if (property.type_bien === 'appartement' || property.type_bien === null) {
    const etage = property.etage;
    const ascenseur = property.ascenseur ?? false;

    if (etage !== null) {
      if (etage === 0) {
        pushAdj({
          label: 'Rez-de-chaussée',
          type: 'discount',
          pct: -5,
          rationale: 'RDC : décote sécurité et luminosité',
        });
      } else if (etage >= 3 && !ascenseur) {
        pushAdj({
          label: `Étage ${etage} sans ascenseur`,
          type: 'discount',
          pct: -7,
          rationale: 'Étage élevé sans ascenseur',
        });
      } else if (etage >= 4 && ascenseur) {
        pushAdj({
          label: `Étage ${etage} avec ascenseur`,
          type: 'premium',
          pct: 3,
          rationale: 'Dernier(s) étage(s) avec ascenseur : vue et calme',
        });
      }
    }
  }

  // ── 2c. Exposition ───────────────────────────────────────────────────
  const expo = property.exposition;
  if (expo === 'sud' || expo === 'sud_est' || expo === 'sud_ouest') {
    pushAdj({
      label: `Exposition ${expo.replace('_', '-')}`,
      type: 'premium',
      pct: 3,
      rationale: 'Exposition favorable : luminosité maximale',
    });
  } else if (expo === 'nord') {
    pushAdj({
      label: 'Exposition nord',
      type: 'discount',
      pct: -3,
      rationale: 'Exposition nord : luminosité réduite',
    });
  } else if (expo === 'traversant') {
    pushAdj({
      label: 'Traversant',
      type: 'premium',
      pct: 3,
      rationale: 'Appartement traversant : double orientation',
    });
  }

  // ── 2c-bis. Vue mer ──────────────────────────────────────────────────
  // Prime de rareté forte sur le littoral. Détectée via le champ `vue` ou
  // les prestations ("vue mer", "vue panoramique mer", "front de mer").
  const vueStr = (property.vue ?? '').toLowerCase();
  const prestaJoined = (property.prestations ?? []).map((p) => p.toLowerCase()).join(' ');
  const hasVueMer =
    vueStr.includes('mer') ||
    prestaJoined.includes('vue mer') ||
    prestaJoined.includes('vue sur mer') ||
    prestaJoined.includes('front de mer');
  if (hasVueMer) {
    const panoramique =
      vueStr.includes('panoram') ||
      prestaJoined.includes('panoram') ||
      vueStr.includes('front de mer') ||
      prestaJoined.includes('front de mer');
    pushAdj({
      label: panoramique ? 'Vue mer panoramique' : 'Vue mer',
      type: 'premium',
      pct: panoramique ? 18 : 12,
      rationale: 'Vue mer : prime de rareté forte sur le littoral',
    });
  }

  // ── 2d. État général ─────────────────────────────────────────────────
  const etat = property.etat_general;
  if (etat === 'a_renover') {
    pushAdj({
      label: 'À rénover',
      type: 'discount',
      pct: -15,
      rationale: 'Bien nécessitant une rénovation complète',
    });
  } else if (etat === 'rafraichissement') {
    pushAdj({
      label: 'Rafraîchissement à prévoir',
      type: 'discount',
      pct: -7,
      rationale: 'Travaux légers de rafraîchissement nécessaires',
    });
  } else if (etat === 'renove_recemment' || etat === 'neuf') {
    pushAdj({
      label: etat === 'neuf' ? 'Neuf' : 'Rénové récemment',
      type: 'premium',
      pct: 5,
      rationale: etat === 'neuf' ? 'Bien neuf, aucun travaux' : 'Rénovation récente, pas de travaux à prévoir',
    });
  }

  // ── 2e. Cachet / standing ────────────────────────────────────────────
  const { hautPlafond, standing } = detectCachet(property);

  if (hautPlafond && standing === 'normal') {
    pushAdj({
      label: 'Hauteur sous plafond > 3 m',
      type: 'premium',
      pct: 6,
      rationale: 'Hauteur sous plafond supérieure à 3 m : cachet architectural',
    });
  }

  if (standing === 'haut_de_gamme') {
    pushAdj({
      label: 'Prestations haut de gamme',
      type: 'premium',
      pct: hautPlafond ? 8 : 8, // hautPlafond inclus dans "cachet" déjà
      rationale: 'Prestations et finitions haut de gamme',
    });
  } else if (standing === 'luxe') {
    pushAdj({
      label: 'Prestations luxe / prestige',
      type: 'premium',
      pct: 15,
      rationale: 'Prestations luxe : matériaux nobles, adresse prestige',
    });
  }

  // ── 2f. Travaux votés ────────────────────────────────────────────────
  if (property.travaux_votes === true) {
    pushAdj({
      label: 'Travaux votés en copropriété',
      type: 'discount',
      pct: -4,
      rationale: 'Travaux de copropriété votés : charge future à provisionner',
    });
  }

  // ── 2g. Charges élevées ──────────────────────────────────────────────
  const surface = property.surface_habitable_m2 ?? property.surface_carrez_m2 ?? null;
  if (
    property.charges_annuelles_eur !== null &&
    surface !== null &&
    surface > 0
  ) {
    const chargesPm2 = property.charges_annuelles_eur / surface;
    if (chargesPm2 > CHARGES_PAR_M2_SEUIL) {
      pushAdj({
        label: 'Charges élevées',
        type: 'discount',
        pct: -3,
        rationale: `Charges annuelles ${Math.round(chargesPm2)} €/m² > seuil ${CHARGES_PAR_M2_SEUIL} €/m²`,
      });
    }
  }

  // ── 2h. Occupation ───────────────────────────────────────────────────
  if (property.occupation === 'loue') {
    pushAdj({
      label: 'Bien loué (décote liquidité)',
      type: 'discount',
      pct: -5,
      rationale: 'Bien occupé par locataire : décote sur liquidité et délai de vente',
    });
  }

  // ── 3. Prix ajusté ───────────────────────────────────────────────────

  const clampedTotalPct = clamp(totalPct, -25, 25);
  const adjustedPerM2 = Math.round(basePerM2 * (1 + clampedTotalPct / 100));

  // ── 4. Surface de référence ──────────────────────────────────────────

  const surfaceRef = property.surface_habitable_m2 ?? property.surface_carrez_m2 ?? 0;

  if (surfaceRef === 0) {
    return {
      basePerM2,
      adjustedPerM2,
      adjustments,
      lowValue: 0,
      marketValue: 0,
      highValue: 0,
      recommendedListingPrice: 0,
      confidence: 'indicative',
      nbComparables: comparables.length,
      engineVersion: ENGINE_VERSION,
      confidenceFactors,
      // Surface inconnue → on ne peut pas produire une valeur : donnée incomplète.
      dataStatus: 'partial',
    };
  }

  // ── 5. Cœur de valeur ────────────────────────────────────────────────

  const core = adjustedPerM2 * surfaceRef;

  // ── 6. Annexes en € absolu ───────────────────────────────────────────

  let annexes = 0;

  // Parking / box / garage
  const stationnement = property.stationnement;
  if (stationnement && stationnement !== 'aucun') {
    const isBox = stationnement === 'box' || stationnement === 'garage';
    const nbPark = property.nb_stationnements ?? 1;
    const prixPark = isBox ? 12_000 : 8_000;
    if (stationnement === 'plusieurs') {
      // "plusieurs" sans précision → on prend 2 places
      annexes += prixPark * Math.max(nbPark, 2);
    } else {
      annexes += prixPark * Math.max(nbPark, 1);
    }
  }

  // Cave
  if (property.cave === true) {
    annexes += 4_000;
  }

  // Piscine (prestation) — plus-value en € absolu hors clamp
  if ((property.prestations ?? []).some((p) => p.toLowerCase().includes('piscine'))) {
    annexes += 30_000;
  }

  // Terrasse / balcon
  if (property.terrasse_balcon_m2 !== null && property.terrasse_balcon_m2 > 0) {
    annexes += Math.round(0.4 * adjustedPerM2 * property.terrasse_balcon_m2);
  }

  // Jardin
  if (property.jardin_m2 !== null && property.jardin_m2 > 0) {
    annexes += Math.round(property.jardin_m2 * (adjustedPerM2 * 0.15));
  }

  // ── 7. Terrain (maison) ──────────────────────────────────────────────
  // PropertyData n'a pas de champ surface_terrain → on ignore proprement.
  // Si un jour ajouté, le calcul serait :
  //   const terrainM2 = (property as any).surface_terrain_m2 ?? 0;
  //   if (property.type_bien === 'maison' && terrainM2 > 0) { ... }

  // ── 8. Market value ──────────────────────────────────────────────────

  const marketValue = Math.round(core + annexes);

  // ── 9. Fourchette ────────────────────────────────────────────────────

  const confidenceMap: Record<'indicative' | 'moyenne' | 'elevee', number> = {
    indicative: 0.10,
    moyenne: 0.07,
    elevee: 0.05,
  };

  const spread = confidenceMap[opts.confidence];
  const lowValue = Math.round(marketValue * (1 - spread));
  const highValue = Math.round(marketValue * (1 + spread));

  // ── 10. Prix annonce recommandé ──────────────────────────────────────

  const recommendedListingPrice = Math.round(marketValue * 1.05);

  return {
    basePerM2,
    adjustedPerM2,
    adjustments,
    lowValue,
    marketValue,
    highValue,
    recommendedListingPrice,
    confidence: opts.confidence,
    nbComparables: comparables.length,
    engineVersion: ENGINE_VERSION,
    confidenceFactors,
    dataStatus,
  };
}
