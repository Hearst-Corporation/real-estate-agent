/**
 * Visite « Clients et portefeuille » — CRM v1 (REA-ONBOARDING-011, LOT 5C+5D).
 * =================================================================
 *
 * Huit étapes, deux surfaces :
 *   - CLIENTS (`/leads`)      : créer un client, distinguer acquéreur et
 *     propriétaire, lire l'avancement, ouvrir une fiche et son historique.
 *   - PORTEFEUILLE (`/properties`) : ajouter un bien, lire l'état du stock,
 *     changer de vue, ouvrir un bien.
 *
 * LOT 10 — aucune étape ne crée, ne modifie ni ne supprime quoi que ce soit :
 * chaque ancre pointe le composant RESPONSABLE de l'action (bouton d'ouverture
 * de formulaire, bloc de lecture), et le moteur ne fait que le mettre en
 * évidence. Les deux étapes de création portent une `consequence` qui rappelle
 * que l'enregistrement dépend d'une validation explicite de l'utilisateur.
 */

import { UI } from "@/lib/ui-strings";
import { defineTour } from "../tours";

const t = UI.onboarding.tours.crm;

/** Ancres `data-tour-id` posées dans `app/(dashboard)/leads|properties/**`. */
export const CRM_ANCHORS = {
  /** Bouton d'ouverture de la modale de création client (LeadFormModal). */
  leadCreate: "lead-create",
  /** Zones métier du cockpit clients : vendeurs chauds vs acquéreurs actifs. */
  leadKinds: "lead-kinds",
  /** Entonnoir de statuts des clients. */
  leadPipeline: "lead-pipeline",
  /** Activité récente : liens vers les fiches client. */
  leadOpen: "lead-open",
  /** Bouton d'ouverture de la modale de création bien (PropertyFormModal). */
  propertyCreate: "property-create",
  /** Zones métier du cockpit portefeuille (actifs, à compléter, récents, clos). */
  propertyIndicators: "property-indicators",
  /** Sélecteur de vue cockpit / kanban / liste. */
  propertyViews: "property-views",
  /** Activité récente : liens vers les fiches bien. */
  propertyOpen: "property-open",
} as const;

const LEADS_ROUTE = "/leads";
const PROPERTIES_ROUTE = "/properties";

export const crmTour = defineTour({
  key: "crm",
  version: 1,
  title: t.title,
  description: t.description,
  entryRoute: LEADS_ROUTE,
  steps: [
    /* ── CLIENTS (LOT 5C) ── */
    {
      id: "leadCreate",
      anchor: CRM_ANCHORS.leadCreate,
      route: LEADS_ROUTE,
      title: t.steps.leadCreate.title,
      body: t.steps.leadCreate.body,
      consequence: t.steps.leadCreate.consequence,
      placement: "bottom",
    },
    {
      id: "leadKinds",
      anchor: CRM_ANCHORS.leadKinds,
      route: LEADS_ROUTE,
      title: t.steps.leadKinds.title,
      body: t.steps.leadKinds.body,
      placement: "auto",
    },
    {
      id: "leadPipeline",
      anchor: CRM_ANCHORS.leadPipeline,
      route: LEADS_ROUTE,
      title: t.steps.leadPipeline.title,
      body: t.steps.leadPipeline.body,
      placement: "auto",
    },
    {
      id: "leadOpen",
      anchor: CRM_ANCHORS.leadOpen,
      route: LEADS_ROUTE,
      title: t.steps.leadOpen.title,
      body: t.steps.leadOpen.body,
      placement: "auto",
    },
    /* ── PORTEFEUILLE (LOT 5D) ── */
    {
      id: "propertyCreate",
      anchor: CRM_ANCHORS.propertyCreate,
      route: PROPERTIES_ROUTE,
      title: t.steps.propertyCreate.title,
      body: t.steps.propertyCreate.body,
      consequence: t.steps.propertyCreate.consequence,
      placement: "bottom",
    },
    {
      id: "propertyIndicators",
      anchor: CRM_ANCHORS.propertyIndicators,
      route: PROPERTIES_ROUTE,
      title: t.steps.propertyIndicators.title,
      body: t.steps.propertyIndicators.body,
      placement: "auto",
    },
    {
      id: "propertyViews",
      anchor: CRM_ANCHORS.propertyViews,
      route: PROPERTIES_ROUTE,
      title: t.steps.propertyViews.title,
      body: t.steps.propertyViews.body,
      placement: "bottom",
    },
    {
      id: "propertyOpen",
      anchor: CRM_ANCHORS.propertyOpen,
      route: PROPERTIES_ROUTE,
      title: t.steps.propertyOpen.title,
      body: t.steps.propertyOpen.body,
      placement: "auto",
    },
  ],
});
