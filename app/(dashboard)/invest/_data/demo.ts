/**
 * DONNÉES DE DÉMO (Jalon 0 — pas de DB). Construites à partir des FIXTURES du
 * moteur financier (lib/invest/finance) via `buildDealSheet`. Aucune valeur
 * inventée hors moteur : les chiffres (TRI, LTV, waterfall…) sont calculés.
 *
 * Cadre anti-FIA : ce sont des deals INDÉPENDANTS (1 SPV = 1 opération). Pas de
 * pooling, pas de NAV. Les positions du portefeuille sont JUXTAPOSÉES, jamais
 * agrégées en une valeur consolidée (L2).
 */
import {
  buildDealSheet,
  RESIDENCE_HAUSSMANN,
  IMMEUBLE_LOCATIF,
  DEAL_DEGRADE,
  type DealInput,
  type DealSheet,
} from "@/lib/invest/finance";
import type { StatusTone } from "@/components/invest";
import { dealBadges, type ProductBadge } from "@/components/invest";

const TYPE_LABEL: Record<DealInput["type_operation"], string> = {
  marchand_de_biens: "Marchand de biens",
  promotion: "Promotion",
  locatif: "Locatif",
};

export interface DemoDeal {
  slug: string;
  input: DealInput;
  sheet: DealSheet;
  /** SAS émettrice (présentation). */
  sasName: string;
  rangLabel: string;
  statusTone: StatusTone;
  statusLabel: string;
  joursRestants: number | null;
  collecteEur: number;
  objectifEur: number;
  risqueEleve: boolean;
  badges: ProductBadge[];
  /** Séquestre tiers nommé (L6) — jamais "compte plateforme". */
  sequestre: string;
}

function make(opts: {
  slug: string;
  input: DealInput;
  sasName: string;
  rangLabel: string;
  statusTone: StatusTone;
  statusLabel: string;
  joursRestants: number | null;
  collecteEur: number;
  sequestre: string;
}): DemoDeal {
  const sheet = buildDealSheet(opts.input);
  const risqueEleve = sheet.metrics.ltv > 0.7 || sheet.metrics.marge_marchand_pct < 0.12;
  return {
    slug: opts.slug,
    input: opts.input,
    sheet,
    sasName: opts.sasName,
    rangLabel: opts.rangLabel,
    statusTone: opts.statusTone,
    statusLabel: opts.statusLabel,
    joursRestants: opts.joursRestants,
    collecteEur: opts.collecteEur,
    objectifEur: opts.input.funding.obligations_cible_eur,
    risqueEleve,
    badges: dealBadges({
      typeLabel: TYPE_LABEL[opts.input.type_operation],
      rangLabel: opts.rangLabel,
      risqueEleve,
    }),
    sequestre: opts.sequestre,
  };
}

/** Catalogue de démo (3 deals indépendants). */
export const DEMO_DEALS: DemoDeal[] = [
  make({
    slug: RESIDENCE_HAUSSMANN.id,
    input: RESIDENCE_HAUSSMANN,
    sasName: "Résidence Haussmann",
    rangLabel: "Senior secured",
    statusTone: "open",
    statusLabel: "Ouvert",
    joursRestants: 14,
    collecteEur: 458_000,
    sequestre: "Me Dupont, notaire (séquestre tiers)",
  }),
  make({
    slug: IMMEUBLE_LOCATIF.id,
    input: { ...IMMEUBLE_LOCATIF, nom: "Le Clos des Vignes — Bordeaux", localisation: "Bordeaux (adresse exacte au closing/NDA)" },
    sasName: "Le Clos des Vignes",
    rangLabel: "Mezzanine",
    statusTone: "soon",
    statusLabel: "Bientôt",
    joursRestants: 30,
    collecteEur: 155_000,
    sequestre: "EMI régulée (séquestre tiers)",
  }),
  make({
    slug: DEAL_DEGRADE.id,
    input: { ...DEAL_DEGRADE, nom: "Atelier Belleville — Paris 20", localisation: "Paris 20e (adresse exacte au closing/NDA)" },
    sasName: "Atelier Belleville",
    rangLabel: "Mezzanine",
    statusTone: "open",
    statusLabel: "Ouvert",
    joursRestants: 7,
    collecteEur: 96_000,
    sequestre: "Me Martin, notaire (séquestre tiers)",
  }),
];

export function getDemoDeal(slug: string): DemoDeal | undefined {
  return DEMO_DEALS.find((d) => d.slug === slug);
}

/**
 * Positions de démo du portefeuille — JUXTAPOSÉES par deal (L2). Chaque position
 * se dénoue à l'exit de SON opération ; aucune valeur consolidée n'est calculée.
 */
export interface DemoPosition {
  deal: DemoDeal;
  capitalPreteEur: number;
  units: number;
  couponsRecusEur: number;
  avancementPct: number;
  ltvActuelle: number;
  statutTone: StatusTone;
  statutLabel: string;
  prochainJalon: string;
}

export const DEMO_POSITIONS: DemoPosition[] = [
  {
    deal: DEMO_DEALS[0],
    capitalPreteEur: 5_000,
    units: 5,
    couponsRecusEur: 0,
    avancementPct: 60,
    ltvActuelle: 0.56,
    statutTone: "open",
    statutLabel: "En cours",
    prochainJalon: "Fin gros œuvre — M+2",
  },
  {
    deal: DEMO_DEALS[1],
    capitalPreteEur: 8_000,
    units: 8,
    couponsRecusEur: 140,
    avancementPct: 90,
    ltvActuelle: 0.54,
    statutTone: "open",
    statutLabel: "En cours",
    prochainJalon: "Prochain coupon — J-22",
  },
  {
    deal: DEMO_DEALS[2],
    capitalPreteEur: 4_000,
    units: 4,
    couponsRecusEur: 0,
    avancementPct: 35,
    ltvActuelle: 0.78,
    statutTone: "late",
    statutLabel: "Retard travaux (+2 mois)",
    prochainJalon: "Reprise chantier — note opérateur publiée",
  },
];
