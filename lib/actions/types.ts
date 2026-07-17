/**
 * lib/actions/types.ts — modèle partagé du CENTRE D'ACTIONS.
 *
 * Une ActionItem = « quoi faire, pour qui, pourquoi », TOUJOURS rattachée à une
 * vraie entité (lead/bien/estimation/mandat/visite/critère/match) → cliquable
 * vers sa fiche. Jamais d'action orpheline, jamais de donnée fabriquée : chaque
 * item est dérivé d'une ligne réelle de la base (statut LIVE).
 *
 * Aucune dépendance React ici (types purs, réutilisables serveur + client).
 */

/** Type d'entité rattachée (aligné sur rea_tasks.entity_type). */
export type ActionEntity =
  | "lead"
  | "property"
  | "estimation"
  | "mandate"
  | "visit"
  | "annonce"
  | "match"
  | "general";

/** Nature d'action rapide proposée (aligné sur rea_tasks.kind). */
export type ActionKind =
  | "appel"
  | "message"
  | "relance"
  | "rdv"
  | "note"
  | "validation"
  | "suivi"
  | "autre";

/** Priorité visuelle — ordre de traitement (haute d'abord). */
export type ActionPriority = "haute" | "normale" | "basse";

/**
 * Catégorie de regroupement du centre d'actions. Sert de clé i18n (UI.dashboard.center.groups)
 * et détermine l'ordre d'affichage.
 */
export type ActionCategory =
  | "overdue" // en retard (tâches persistées échues)
  | "today" // à faire aujourd'hui (tâches + RDV du jour)
  | "task" // tâches persistées ouvertes (sans échéance passée/du jour) — à faire
  | "relance" // leads non touchés depuis N jours
  | "rdv" // visites à venir
  | "estimation" // estimations à reprendre (draft/interviewing/recap)
  | "acquereur" // acquéreurs (critères) sans proposition récente
  | "match" // matchs à examiner
  | "proprietaire" // propriétaires à rappeler (leads vendeur)
  | "mandat" // opportunités de mandat (brouillon)
  | "validation"; // éléments nécessitant validation humaine

/** Action rapide honnête attachée à un item. */
export type QuickAction =
  | { kind: "call"; phone: string } // tel: réel
  | { kind: "message"; leadId?: string; annonceId?: string } // → brouillon enregistré
  | { kind: "schedule"; propertyId?: string; leadId?: string } // → visite LIVE
  | { kind: "open"; href: string } // ouvrir la fiche
  | { kind: "done" } // marquer traité (rea_tasks)
  | { kind: "snooze" } // reporter (rea_tasks)
  | { kind: "validate" }; // demander une validation (rea_tasks kind=validation)

/**
 * Une action dérivée du réel OU une tâche persistée.
 * - `taskId` présent ⇒ item ADOSSÉ à une ligne rea_tasks (done/snooze possibles).
 * - `taskId` absent ⇒ item DÉRIVÉ (opportunité détectée) : on peut le transformer
 *   en tâche persistée via « créer une tâche ».
 */
export type ActionItem = {
  /** Identifiant STABLE pour React (dérivé : `${category}:${entityId}` ; tâche : taskId). */
  id: string;
  category: ActionCategory;
  entity: ActionEntity;
  /** UUID de l'entité rattachée (null seulement pour general sans cible). */
  entityId: string | null;
  /** Ligne 1 — QUI / QUOI. */
  title: string;
  /** Ligne 2 — POURQUOI (raison métier explicite). */
  reason: string;
  priority: ActionPriority;
  /** Ancre temporelle affichable (échéance, date RDV, dernier contact…). */
  when?: string;
  /** Lien direct vers la fiche de l'entité. */
  href: string;
  /** Actions rapides proposées (téléphone présent seulement si connu). */
  quick: QuickAction[];
  /** Présent si l'item est adossé à une tâche persistée rea_tasks. */
  taskId?: string;
  /** Statut de la tâche persistée (open/snoozed/done) si applicable. */
  taskStatus?: "open" | "snoozed" | "done";
};

/** Comptes par catégorie, pour l'en-tête du centre d'actions. */
export type ActionCounts = Record<ActionCategory, number>;
