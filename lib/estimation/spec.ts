import type { PropertyData } from './types';

// ─── Block definition ─────────────────────────────────────────────────────────

export type Block = {
  index: number;
  key: string;
  title: string;
  intro: string;
  questions: {
    id: string;
    field: keyof PropertyData | null;
    label: string;
  }[];
};

// ─── 9 interview blocks ───────────────────────────────────────────────────────

export const BLOCKS: Block[] = [
  {
    index: 1,
    key: 'identification',
    title: 'Identification du bien',
    intro:
      'Commençons par identifier précisément le bien que vous souhaitez estimer.',
    questions: [
      {
        id: 'B1Q1',
        field: 'type_bien',
        label:
          "Quel est le type de bien ? (appartement / maison / local commercial / immeuble / terrain / autre)",
      },
      {
        id: 'B1Q2',
        field: 'adresse',
        label: "Quelle est l'adresse complète ? (numéro, rue)",
      },
      {
        id: 'B1Q3',
        field: 'ville',
        label: 'Ville, code postal et secteur (quartier / arrondissement) ?',
      },
    ],
  },
  {
    index: 2,
    key: 'caracteristiques',
    title: 'Caractéristiques principales',
    intro: 'Parlons maintenant des surfaces et de la configuration du bien.',
    questions: [
      {
        id: 'B2Q1',
        field: 'surface_habitable_m2',
        label: 'Quelle est la surface habitable en m² ?',
      },
      {
        id: 'B2Q2',
        field: 'surface_carrez_m2',
        label: 'Connaissez-vous la surface Carrez exacte ? Est-elle confirmée par un mesurage récent ?',
      },
      {
        id: 'B2Q3',
        field: 'nombre_pieces',
        label: "Combien de pièces principales (au sens immobilier : séjour + chambres) ?",
      },
      {
        id: 'B2Q4',
        field: 'nombre_chambres',
        label: 'Combien de chambres ?',
      },
      {
        id: 'B2Q5',
        field: 'etage',
        label:
          "À quel étage se situe le bien ? Combien d'étages au total dans l'immeuble (ou niveaux si maison) ?",
      },
    ],
  },
  {
    index: 3,
    key: 'confort_interieur',
    title: 'Confort intérieur',
    intro: "Détaillons maintenant les éléments de confort à l'intérieur du bien.",
    questions: [
      {
        id: 'B3Q1',
        field: 'ascenseur',
        label: "Y a-t-il un ascenseur dans l'immeuble ?",
      },
      {
        id: 'B3Q2',
        field: 'vue',
        label:
          'Quelle est la vue depuis le bien ? (mer, montagne, dégagée, sur rue, vis-à-vis, parc…)',
      },
      {
        id: 'B3Q3',
        field: 'exposition',
        label:
          "Quelle est l'exposition principale ? (nord, sud, est, ouest, sud-est, sud-ouest, nord-est, nord-ouest, traversant) Et la luminosité générale ?",
      },
      {
        id: 'B3Q4',
        field: 'hauteur_sous_plafond_m',
        label: 'Quelle est la hauteur sous plafond (en mètres) ?',
      },
    ],
  },
  {
    index: 4,
    key: 'annexes_stationnement',
    title: 'Annexes & stationnement',
    intro: 'Voyons maintenant les annexes et les espaces de stationnement.',
    questions: [
      {
        id: 'B4Q1',
        field: 'stationnement',
        label:
          "Y a-t-il un stationnement ? (garage / place sous-sol / place extérieure / box) Si oui, combien de places ?",
      },
      {
        id: 'B4Q2',
        field: 'cave',
        label: 'Y a-t-il une cave ? Si oui, quelle est sa surface approximative ?',
      },
      {
        id: 'B4Q3',
        field: 'terrasse_balcon_m2',
        label: "Y a-t-il une terrasse, un balcon ou une loggia ? Quelle est la surface (en m²) ?",
      },
      {
        id: 'B4Q4',
        field: 'jardin_m2',
        label: "Y a-t-il un jardin privatif ? Quelle est sa surface (en m²) ?",
      },
    ],
  },
  {
    index: 5,
    key: 'etat_qualite',
    title: 'État & qualité du bien',
    intro: "Évaluons maintenant l'état général et la qualité du bien.",
    questions: [
      {
        id: 'B5Q1',
        field: 'etat_general',
        label:
          "Quel est l'état général ? (à rénover / rafraîchissement / bon état / rénové récemment — si oui, année / neuf ou VEFA)",
      },
      {
        id: 'B5Q2',
        field: 'qualite_renovation',
        label:
          "Si des travaux ont été réalisés, s'agissait-il d'une rénovation superficielle (peinture, sol) ou structurelle (électricité, plomberie, isolation, matériaux haut de gamme) ?",
      },
      {
        id: 'B5Q3',
        field: 'meuble',
        label: 'Le bien est-il meublé ? Le mobilier est-il inclus dans la vente ?',
      },
      {
        id: 'B5Q4',
        field: 'dpe_classe',
        label:
          "Quelle est la classe DPE (A à G) ? Le diagnostic est-il récent (moins de 10 ans) ?",
      },
    ],
  },
  {
    index: 6,
    key: 'copropriete',
    title: 'Copropriété',
    intro: "Informations sur la copropriété et les charges.",
    questions: [
      {
        id: 'B6Q1',
        field: 'etat_copropriete',
        label:
          "Comment sont les parties communes, la façade et la toiture de l'immeuble / de la résidence ?",
      },
      {
        id: 'B6Q2',
        field: 'nombre_lots',
        label: "Combien de lots comporte la copropriété ?",
      },
      {
        id: 'B6Q3',
        field: 'charges_annuelles_eur',
        label: "Quel est le montant des charges annuelles de copropriété (en €) ?",
      },
      {
        id: 'B6Q4',
        field: 'travaux_votes',
        label:
          "Y a-t-il des travaux votés en assemblée générale ou des appels de fonds prévus ?",
      },
    ],
  },
  {
    index: 7,
    key: 'prestations_distinctifs',
    title: 'Prestations & éléments distinctifs',
    intro:
      "Identifions maintenant ce qui rend ce bien unique sur le marché.",
    questions: [
      {
        id: 'B7Q1',
        field: 'standing_style',
        label:
          "Quel est le style architectural ou le standing de l'immeuble ? (haussmannien, Napoléon III, Art Déco, provençal, contemporain, années 70…)",
      },
      {
        id: 'B7Q2',
        field: 'prestations',
        label:
          "Quelles sont les prestations particulières ? (moulures, cheminées, parquet ancien, double séjour, cuisine équipée haut de gamme, climatisation, domotique, piscine, vue exceptionnelle…)",
      },
      {
        id: 'B7Q3',
        field: 'nuisances',
        label:
          "Y a-t-il des nuisances connues ? (bruit de rue, vis-à-vis, voie ferrée, zone inondable, pylônes…)",
      },
    ],
  },
  {
    index: 8,
    key: 'contexte_vente',
    title: 'Contexte de la vente',
    intro: "Comprenons maintenant le contexte et les contraintes de cette vente.",
    questions: [
      {
        id: 'B8Q1',
        field: 'motif_vente',
        label:
          "Quel est le motif de la vente ? (succession, séparation, déménagement, investisseur, marchand de biens…)",
      },
      {
        id: 'B8Q2',
        field: 'delai_souhaite',
        label: "Quel est le délai souhaité pour la vente ? Y a-t-il une urgence ?",
      },
      {
        id: 'B8Q3',
        field: 'occupation',
        label:
          "Quelle est l'occupation actuelle du bien ? (libre / loué — si oui, quel loyer mensuel / résidence principale)",
      },
    ],
  },
  {
    index: 9,
    key: 'commentaires',
    title: 'Commentaires complémentaires',
    intro:
      "Pour finir, y a-t-il des informations supplémentaires à prendre en compte ?",
    questions: [
      {
        id: 'B9Q1',
        field: 'commentaires',
        label:
          "Avez-vous des commentaires libres à ajouter ? (historique du bien, projets urbains à proximité, servitudes, particularités non mentionnées…)",
      },
    ],
  },
];

/** Nombre total de blocs d'entretien — source unique pour les barres de progression. */
export const TOTAL_BLOCKS = BLOCKS.length;

/** Label humain de chaque bloc pour le stepper wizard. */
export const BLOCK_LABELS: Record<number, string> = {
  1: 'Identification du bien',
  2: 'Surfaces & configuration',
  3: 'Confort intérieur',
  4: 'Annexes & stationnement',
  5: 'État & qualité',
  6: 'Copropriété',
  7: 'Prestations & distinctifs',
  8: 'Contexte de la vente',
  9: 'Commentaires',
};

// ─── Recap fields (ordered) ───────────────────────────────────────────────────

export const RECAP_FIELDS: { field: keyof PropertyData; label: string }[] = [
  { field: 'type_bien', label: 'Type de bien' },
  { field: 'adresse', label: 'Adresse' },
  { field: 'ville', label: 'Ville' },
  { field: 'code_postal', label: 'Code postal' },
  { field: 'secteur', label: 'Secteur / quartier' },
  { field: 'surface_habitable_m2', label: 'Surface habitable (m²)' },
  { field: 'surface_carrez_m2', label: 'Surface Carrez (m²)' },
  { field: 'surface_carrez_confirmee', label: 'Surface Carrez confirmée' },
  { field: 'nombre_pieces', label: 'Nombre de pièces' },
  { field: 'nombre_chambres', label: 'Nombre de chambres' },
  { field: 'etage', label: 'Étage' },
  { field: 'nb_etages_total', label: "Nb d'étages total" },
  { field: 'ascenseur', label: 'Ascenseur' },
  { field: 'vue', label: 'Vue' },
  { field: 'exposition', label: 'Exposition' },
  { field: 'luminosite', label: 'Luminosité' },
  { field: 'hauteur_sous_plafond_m', label: 'Hauteur sous plafond (m)' },
  { field: 'stationnement', label: 'Stationnement' },
  { field: 'nb_stationnements', label: 'Nb de stationnements' },
  { field: 'cave', label: 'Cave' },
  { field: 'cave_surface_m2', label: 'Surface cave (m²)' },
  { field: 'terrasse_balcon_m2', label: 'Terrasse / balcon (m²)' },
  { field: 'jardin_m2', label: 'Jardin (m²)' },
  { field: 'etat_general', label: 'État général' },
  { field: 'annee_renovation', label: 'Année de rénovation' },
  { field: 'qualite_renovation', label: 'Qualité rénovation' },
  { field: 'meuble', label: 'Meublé' },
  { field: 'meuble_inclus', label: 'Mobilier inclus dans la vente' },
  { field: 'dpe_classe', label: 'Classe DPE' },
  { field: 'ges_classe', label: 'Classe GES' },
  { field: 'annee_dpe', label: 'Année DPE' },
  { field: 'etat_copropriete', label: 'État copropriété' },
  { field: 'nombre_lots', label: 'Nombre de lots' },
  { field: 'charges_annuelles_eur', label: 'Charges annuelles (€)' },
  { field: 'travaux_votes', label: 'Travaux votés' },
  { field: 'standing_style', label: 'Standing / style architectural' },
  { field: 'prestations', label: 'Prestations particulières' },
  { field: 'nuisances', label: 'Nuisances' },
  { field: 'motif_vente', label: 'Motif de la vente' },
  { field: 'delai_souhaite', label: 'Délai souhaité' },
  { field: 'occupation', label: 'Occupation' },
  { field: 'loyer_mensuel_eur', label: 'Loyer mensuel (€)' },
  { field: 'commentaires', label: 'Commentaires' },
];

// ─── Data gaps ────────────────────────────────────────────────────────────────

export const DATA_GAPS: {
  field: string;
  impact: 'fort' | 'moyen';
  action: string;
}[] = [
  {
    field: 'dpe_classe',
    impact: 'fort',
    action:
      "DPE manquant — décote potentielle de 5 à 12 %. Estimer la valeur avec et sans DPE pour encadrer l'incertitude.",
  },
  {
    field: 'surface_carrez_m2',
    impact: 'moyen',
    action:
      "Surface Carrez exacte inconnue — ajouter une réserve sur l'estimation au m².",
  },
  {
    field: 'charges_annuelles_eur',
    impact: 'moyen',
    action:
      "Charges copro non communiquées — utiliser un ordre de grandeur (30–50 €/m²/an) à valider.",
  },
  {
    field: 'hauteur_sous_plafond_m',
    impact: 'moyen',
    action:
      "Hauteur sous plafond inconnue — pour un bien ancien, supposer 2,8–3,5 m ; vérifier si haussmannien.",
  },
  {
    field: 'travaux_votes',
    impact: 'fort',
    action:
      "Travaux votés non renseignés — risque d'appels de fonds importants à signaler à l'acquéreur.",
  },
  {
    field: 'vue',
    impact: 'moyen',
    action:
      "Pérennité de la vue / PLU non vérifiée — consulter le PLU local pour s'assurer qu'aucune construction n'est prévue.",
  },
];
