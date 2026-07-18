// lib/conversion/types.ts — Modèle du cockpit de conversion.
//
// Le pipeline commercial réel est reconstruit à partir des lignes DB existantes :
//   leads (statut = étage du prospect), estimations, visits, mandates.
// AUCUN événement synthétique : chaque compteur dérive d'une ligne réelle.
// AUCUN chiffre inventé : conversions, délais et pertes se CALCULENT.

/** Segmentation par type de prospect (colonne leads.kind, CHECK DB). */
export type ProspectKind = "acheteur" | "vendeur";

/** Granularité de la segmentation temporelle. */
export type PeriodGrain = "month" | "quarter";

/** Lignes brutes minimales lues en base, indépendantes du client PostgREST. */
export type RawLead = {
  id: string;
  status: string;
  kind: string | null;
  created_at: string;
  updated_at: string;
};

export type RawEstimation = {
  id: string;
  status: string;
  created_at: string;
  owner_lead_id: string | null;
};

export type RawVisit = {
  id: string;
  status: string;
  created_at: string;
  scheduled_at: string;
  lead_id: string | null;
};

export type RawMandate = {
  id: string;
  status: string;
  created_at: string;
  signed_at: string | null;
};

/** Toutes les sources agrégées pour une fenêtre + un segment. */
export type ConversionSources = {
  leads: RawLead[];
  estimations: RawEstimation[];
  visits: RawVisit[];
  mandates: RawMandate[];
};

/** Une clé de segment de prospect. `all` = pas de filtre kind. */
export type SegmentKind = ProspectKind | "all";

/** Un étage du funnel — dérivé de comptes réels. */
export type StageId =
  | "prospect" // lead créé (nouveau/contacte)
  | "qualified" // lead qualifié (qualifie et au-delà)
  | "engaged" // estimation OU visite réalisée
  | "proposal" // offre / mandat signé
  | "won"; // gagné / mandat réalisé

export type FunnelStage = {
  id: StageId;
  /** Nombre de leads réels ayant atteint cet étage (monotone décroissant). */
  count: number;
  /** Taux de passage depuis l'étage précédent (0..1). null au 1er étage. */
  stepRate: number | null;
  /** Taux de conversion depuis le sommet du funnel (0..1). */
  cumulativeRate: number;
  /** Route de navigation vers la liste filtrée réelle. */
  href: string;
};

/** Délai médian (jours) mesuré entre deux jalons réels. */
export type StageDelay = {
  fromStatus: string;
  toStatus: string;
  /** Médiane en jours, null si aucune paire mesurable. */
  medianDays: number | null;
  /** Nombre de leads sur lesquels le délai a pu être mesuré. */
  sample: number;
};

/** Perte à un étage : leads entrés, sortis en perdu, non convertis. */
export type StageLoss = {
  stage: StageId;
  /** Leads perdus (status = perdu) rattachés à cet étage. */
  lost: number;
  /** Part des pertes totales (0..1). */
  share: number;
};

/** Résultat complet du calcul pour un segment. */
export type ConversionReport = {
  segment: SegmentKind;
  grain: PeriodGrain;
  /** Fenêtre analysée (ISO). */
  from: string;
  to: string;
  totalLeads: number;
  stages: FunnelStage[];
  delays: StageDelay[];
  losses: StageLoss[];
  /** Taux de conversion global prospect→gagné (0..1). */
  winRate: number;
  /** Taux de perte global (0..1). */
  lossRate: number;
};
