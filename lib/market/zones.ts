/**
 * lib/market/zones.ts — Données de marché statiques, Côte d'Azur.
 * Valeurs représentatives du marché 2026 (sources : DVF, baromètre FNAIM 06).
 * À remplacer par une source dynamique (DVF API) quand disponible.
 */

export type Tendance = "hausse" | "forte_hausse" | "stable_premium" | "stable" | "baisse";

export interface ZoneAxes {
  attractivite: number;  // 0-100 : cadre de vie, transports, écoles
  liquidite: number;     // 0-100 : vitesse de transaction
  rendement: number;     // 0-100 : potentiel locatif ou revalorisation
  risque: number;        // 0-100 : risque de dépréciation (bas = sain)
  demande: number;       // 0-100 : pression acheteurs/locataires
  offre: number;         // 0-100 : tension de l'offre disponible
}

export interface ZoneMarche {
  id: string;
  label: string;
  prixM2: number;       // € / m² (moyen tous biens)
  prixM2Appart: number; // € / m² appartements
  prixM2Maison: number; // € / m² maisons / villas
  delta12m: number;     // % de variation sur 12 mois
  nbOffres: number;     // biens actifs estimés dans la zone
  tendance: Tendance;
  axes: ZoneAxes;
  description: string;
}

export const ZONES_MARCHE: ZoneMarche[] = [
  {
    id: "antibes-centre",
    label: "Antibes Centre",
    prixM2: 5200,
    prixM2Appart: 5100,
    prixM2Maison: 6200,
    delta12m: 3.2,
    nbOffres: 47,
    tendance: "hausse",
    axes: {
      attractivite: 72,
      liquidite: 65,
      rendement: 58,
      risque: 40,
      demande: 70,
      offre: 55,
    },
    description: "Centre-ville commerçant, bonne liquidité, prix intermédiaires.",
  },
  {
    id: "juan-les-pins",
    label: "Juan-les-Pins",
    prixM2: 6100,
    prixM2Appart: 5900,
    prixM2Maison: 7800,
    delta12m: 5.8,
    nbOffres: 31,
    tendance: "forte_hausse",
    axes: {
      attractivite: 85,
      liquidite: 60,
      rendement: 62,
      risque: 35,
      demande: 82,
      offre: 40,
    },
    description: "Front de mer prisé, forte demande saisonnière et résidentielle.",
  },
  {
    id: "vieille-antibes",
    label: "Vieille Antibes",
    prixM2: 6800,
    prixM2Appart: 6600,
    prixM2Maison: 9500,
    delta12m: 2.1,
    nbOffres: 18,
    tendance: "stable_premium",
    axes: {
      attractivite: 90,
      liquidite: 50,
      rendement: 55,
      risque: 30,
      demande: 75,
      offre: 30,
    },
    description: "Vieux quartier patrimonial, segment premium, offre très contrainte.",
  },
];

export const ZONE_PAR_ID = new Map<string, ZoneMarche>(ZONES_MARCHE.map((z) => [z.id, z]));

/** Prix min/max pour le dégradé de la carte. */
export const PRIX_MIN = Math.min(...ZONES_MARCHE.map((z) => z.prixM2));
export const PRIX_MAX = Math.max(...ZONES_MARCHE.map((z) => z.prixM2));

/** Normalise un prix entre 0 (min) et 1 (max). */
export function normalisePrix(prixM2: number): number {
  if (PRIX_MAX === PRIX_MIN) return 0.5;
  return (prixM2 - PRIX_MIN) / (PRIX_MAX - PRIX_MIN);
}

export const TENDANCE_LABEL: Record<Tendance, string> = {
  forte_hausse: "Forte hausse",
  hausse: "Hausse",
  stable_premium: "Stable · premium",
  stable: "Stable",
  baisse: "Recul",
};

export const TENDANCE_TONE: Record<Tendance, "is-positive" | "is-pending" | "is-negative"> = {
  forte_hausse: "is-positive",
  hausse: "is-positive",
  stable_premium: "is-pending",
  stable: "is-pending",
  baisse: "is-negative",
};
