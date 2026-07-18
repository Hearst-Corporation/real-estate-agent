/**
 * Product tour — contrat de types (REA-ONBOARDING-011, LOT 1).
 * =================================================================
 *
 * Socle partagé : les tours métier (prospection, CRM, estimations, off-market,
 * communications HITL, agents, radar) se déclarent CONTRE ces types et rien
 * d'autre. Le moteur (components/onboarding/*) ne connaît que ce contrat.
 *
 * DOCTRINE — le moteur MONTRE, il n'EXÉCUTE JAMAIS :
 *   une étape pointe un composant réel via `data-tour-id` et explique une action
 *   concrète. Elle ne clique pas, ne soumet pas, ne mute aucune donnée métier.
 *   `tourActive` (cf. TourContextValue) permet à un composant sensible de
 *   refuser toute activation pendant la visite.
 */

/** Clés de visite du LOT 11 — registre versionné, une clé par domaine produit. */
export type TourKey =
  | "core-cockpit"
  | "prospection"
  | "crm"
  | "estimations"
  | "offmarket"
  | "communications-hitl"
  | "agents"
  | "radar";

/** Toutes les clés connues, dans l'ordre d'apprentissage recommandé. */
export const TOUR_KEYS: readonly TourKey[] = [
  "core-cockpit",
  "prospection",
  "crm",
  "estimations",
  "offmarket",
  "communications-hitl",
  "agents",
  "radar",
] as const;

/**
 * Placement de la pancarte relativement à la cible.
 * `auto` = le moteur choisit le premier côté qui tient dans le viewport.
 * `center` = pancarte centrée à l'écran, sans découpe (étape d'introduction).
 */
export type TourPlacement = "auto" | "top" | "bottom" | "left" | "right" | "center";

/**
 * Que faire si l'élément cible reste introuvable après attente ?
 * - `center` (défaut) : afficher l'explication au centre, sans découpe.
 * - `skip`            : passer proprement à l'étape suivante.
 * Dans les DEUX cas l'interface n'est jamais bloquée.
 */
export type MissingAnchorStrategy = "center" | "skip";

/** Une étape = un composant réel + une explication. */
export interface TourStep {
  /** Identifiant stable et unique DANS le tour (sert de clé de reprise). */
  id: string;
  /**
   * Valeur de l'attribut `data-tour-id` posé sur le vrai composant responsable
   * de l'action. JAMAIS de sélecteur CSS, jamais de `nth-child`.
   * Absent → étape purement explicative, affichée au centre.
   */
  anchor?: string;
  /**
   * `pathname` requis pour que la cible existe. Le moteur navigue tout seul
   * (changement de route géré) avant de chercher l'ancre.
   */
  route?: string;
  /** Titre court de la pancarte. */
  title: string;
  /** Explication : 1-2 phrases, français direct, métier. */
  body: string;
  /** Conséquence éventuelle de l'action montrée (« ce bouton envoie… »). */
  consequence?: string;
  /** Côté de la pancarte (défaut `auto`). */
  placement?: TourPlacement;
  /** Comportement si la cible est absente (défaut `center`). */
  onMissing?: MissingAnchorStrategy;
  /** Attente max de l'ancre pour les éléments chargés en asynchrone (ms). */
  waitMs?: number;
  /** Marge de la découpe autour de la cible, en px (défaut SPOTLIGHT_PADDING). */
  padding?: number;
}

/** Une visite complète, versionnée. */
export interface TourDefinition {
  key: TourKey;
  /** Incrémenter invalide la reprise stockée → la visite repart de l'étape 1. */
  version: number;
  /** Titre affiché dans un lanceur de visite. */
  title: string;
  /** Une phrase : ce que l'utilisateur saura faire à la fin. */
  description: string;
  /** Route d'entrée : le moteur y navigue avant la première étape. */
  entryRoute: string;
  steps: readonly TourStep[];
}

/** Statut d'une visite pour un utilisateur. */
export type TourStatus = "idle" | "running" | "completed" | "skipped";

/** État persistable d'une visite (sérialisé pour la reprise après rechargement). */
export interface TourProgress {
  key: TourKey;
  version: number;
  /** Index de l'étape courante (0-based), toujours borné aux étapes du tour. */
  stepIndex: number;
  status: TourStatus;
  /** Epoch ms de la dernière mutation — utile au tri/diagnostic. */
  updatedAt: number;
}

/** Registre : une entrée par clé. `null` = tour pas encore livré par son worker. */
export type TourRegistry = Record<TourKey, TourDefinition | null>;

/**
 * Résolution DOM d'une étape, telle que le moteur la calcule.
 * `rect === null` → pas de découpe : pancarte centrée.
 */
export interface TourTarget {
  rect: TourRect | null;
  /** Vrai si l'ancre était demandée mais introuvable (le moteur l'annonce). */
  missing: boolean;
}

/** Rectangle viewport-relatif (px). */
export interface TourRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Ce que consomme un composant via `useProductTour()`. */
export interface TourContextValue {
  /**
   * LOT 10 — vrai dès qu'une visite est en cours.
   * Un composant sensible DOIT tester ce drapeau et refuser toute activation
   * (envoi, approbation, création, lancement d'agent) tant qu'il est vrai.
   */
  tourActive: boolean;
  /** Définition en cours, `null` hors visite. */
  activeTour: TourDefinition | null;
  /** Étape en cours, `null` hors visite. */
  activeStep: TourStep | null;
  /** Index 0-based de l'étape en cours (`-1` hors visite). */
  stepIndex: number;
  /** Nombre total d'étapes du tour en cours (`0` hors visite). */
  stepCount: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  /** Démarre (ou redémarre depuis le début) une visite. */
  startTour: (key: TourKey) => void;
  /** Reprend une visite interrompue si un état `running` est stocké. */
  resumeTour: (key: TourKey) => void;
  nextStep: () => void;
  prevStep: () => void;
  /** Abandon volontaire (bouton « Passer », Échap) → statut `skipped`. */
  skipTour: () => void;
  /** Fin normale (dernière étape) → statut `completed`. */
  finishTour: () => void;
  /** Statut connu d'une visite (lu depuis le stockage local). */
  statusOf: (key: TourKey) => TourStatus;
  /** Tours livrés et disponibles au lancement. */
  availableTours: readonly TourDefinition[];
}
