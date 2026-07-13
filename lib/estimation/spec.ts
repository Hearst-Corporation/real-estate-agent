import type { PropertyData, FieldStatusMap } from './types';

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

// ─── Boîtes de sélection (options finies par champ) ───────────────────────────

const OUI_NON: string[] = ['Oui', 'Non', 'Je ne sais pas'];

/**
 * Options cliquables pour les champs à réponse FINIE. Sert au fallback
 * déterministe quand l'agent n'émet pas lui-même `suggestions`.
 * Les libellés sont en clair (l'agent re-mappe vers l'enum côté outil).
 */
const FIELD_OPTIONS: Partial<Record<keyof PropertyData, string[]>> = {
  type_bien: ['Appartement', 'Maison', 'Immeuble', 'Local commercial', 'Terrain', 'Autre'],
  exposition: ['Sud', 'Nord', 'Est', 'Ouest', 'Sud-est', 'Sud-ouest', 'Nord-est', 'Nord-ouest', 'Traversant', 'Je ne sais pas'],
  etat_general: ['À rénover', 'Rafraîchissement', 'Bon état', 'Rénové récemment', 'Neuf'],
  qualite_renovation: ['Superficielle', 'Structurelle', 'Je ne sais pas'],
  dpe_classe: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Pas encore réalisé'],
  ges_classe: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Pas encore réalisé'],
  stationnement: ['Aucun', 'Place extérieure', 'Place sous-sol', 'Box', 'Garage', 'Plusieurs'],
  occupation: ['Libre', 'Loué', 'Résidence principale'],
  ascenseur: OUI_NON,
  cave: OUI_NON,
  meuble: OUI_NON,
  meuble_inclus: OUI_NON,
  travaux_votes: OUI_NON,
  surface_carrez_confirmee: OUI_NON,
  delai_souhaite: ['Moins de 3 mois', '3 à 6 mois', '6 à 12 mois', 'Pas pressé'],
  motif_vente: ["Achat d'un autre bien", 'Succession', 'Mutation', 'Investissement', 'Séparation', 'Autre'],
};

// ─── Modèle de COUVERTURE (flow adaptatif, 1 passe) ───────────────────────────
//
// Remplace la progression « 9 blocs confirmés » par une couverture de champs :
//   - essentiels (type de bien, surface, localisation) → débloquent "Générer"
//     (cf. canGenerate ci-dessous).
//   - PRIORITY_FIELDS : champs à fort impact, dans l'ordre de collecte. L'agent
//     suit cet ordre ; les chips déterministes en dérivent → chips TOUJOURS
//     alignés sur la question réellement posée.

/**
 * Champs à fort impact, dans l'ordre de priorité de collecte (label = focus
 * affiché dans le stepper). Sert à la fois à la barre de progression « infos
 * clés » et au choix déterministe des chips.
 */
export const PRIORITY_FIELDS: { field: keyof PropertyData; label: string }[] = [
  { field: 'type_bien', label: 'Type de bien' },
  { field: 'adresse', label: 'Adresse' },
  { field: 'ville', label: 'Ville / code postal' },
  { field: 'surface_habitable_m2', label: 'Surface habitable' },
  { field: 'nombre_pieces', label: 'Nombre de pièces' },
  { field: 'nombre_chambres', label: 'Chambres' },
  { field: 'etage', label: 'Étage' },
  { field: 'etat_general', label: 'État général' },
  { field: 'dpe_classe', label: 'Classe DPE' },
  { field: 'exposition', label: 'Exposition' },
  { field: 'ascenseur', label: 'Ascenseur' },
  { field: 'stationnement', label: 'Stationnement' },
  { field: 'terrasse_balcon_m2', label: 'Terrasse / balcon' },
  { field: 'occupation', label: 'Occupation' },
];

/** Nombre d'infos clés suivies — source unique des barres de progression. */
export const TOTAL_KEY_FIELDS = PRIORITY_FIELDS.length;

function isFilled(property: PropertyData, f: keyof PropertyData): boolean {
  const v = property[f];
  return Array.isArray(v) ? v.length > 0 : v != null && v !== '';
}

/** Un champ est « traité » s'il est renseigné OU explicitement à confirmer. */
function isAddressed(
  property: PropertyData,
  fieldStatus: FieldStatusMap,
  f: keyof PropertyData
): boolean {
  return isFilled(property, f) || fieldStatus[f] === 'to_confirm';
}

export type Coverage = { collected: number; total: number };

/** Couverture des infos clés (traitées = renseignées ou à confirmer). */
export function coverageOf(
  property: PropertyData,
  fieldStatus: FieldStatusMap
): Coverage {
  const collected = PRIORITY_FIELDS.filter(({ field }) =>
    isAddressed(property, fieldStatus, field)
  ).length;
  return { collected, total: TOTAL_KEY_FIELDS };
}

/**
 * Génération possible dès que les 3 essentiels sont là : type de bien, surface,
 * et UNE localisation (ville OU adresse — le géocodeur sait partir de l'une ou
 * l'autre). Localisation assouplie pour ne pas bloquer quand le modèle a capté
 * l'adresse mais pas la ville (ou inversement).
 */
export function canGenerate(property: PropertyData): boolean {
  const hasLocation = isFilled(property, 'ville') || isFilled(property, 'adresse');
  return (
    isFilled(property, 'type_bien') &&
    isFilled(property, 'surface_habitable_m2') &&
    hasLocation
  );
}

/**
 * BACKSTOP déterministe : l'extraction LLM rate parfois un champ critique
 * pourtant explicite dans le message du vendeur (type de bien, surface). On
 * comble UNIQUEMENT les champs encore vides à partir d'un scan haute-confiance
 * du texte — jamais d'écrasement d'une valeur déjà fournie par le modèle.
 */
const TYPE_PATTERNS: { re: RegExp; value: PropertyData['type_bien'] }[] = [
  { re: /\b(appartements?|apparts?|studios?|lofts?|duplex|triplex|t[1-6]|f[1-6])\b/i, value: 'appartement' },
  { re: /\b(maisons?|villas?|pavillons?|long[èe]res?|mas|bastides?|fermettes?)\b/i, value: 'maison' },
  { re: /\bimmeubles?\b/i, value: 'immeuble' },
  { re: /\b(local\s+commercial|locaux\s+commerciaux|commerces?|boutiques?|bureaux?)\b/i, value: 'local_commercial' },
  { re: /\bterrains?\b/i, value: 'terrain' },
];

export function inferCriticalFromText(
  text: string,
  property: PropertyData
): Partial<PropertyData> {
  const out: Partial<PropertyData> = {};

  if (!isFilled(property, 'type_bien')) {
    for (const { re, value } of TYPE_PATTERNS) {
      if (re.test(text)) {
        out.type_bien = value;
        break;
      }
    }
  }

  if (!isFilled(property, 'surface_habitable_m2')) {
    // « 75 m² », « 80m2 », « 90 mètres carrés » — premier nombre plausible.
    const m = text.match(/(\d{1,4})(?:[.,]\d+)?\s*(?:m²|m2|m\b|mètres?\s*carr[ée]s?)/i);
    if (m) {
      const n = Number(m[1]);
      if (n >= 5 && n <= 100000) out.surface_habitable_m2 = n;
    }
  }

  return out;
}

/** Premier champ prioritaire encore NON traité (focus courant). null si tout est couvert. */
function nextFocusField(
  property: PropertyData,
  fieldStatus: FieldStatusMap
): keyof PropertyData | null {
  return (
    PRIORITY_FIELDS.find(({ field }) => !isAddressed(property, fieldStatus, field))
      ?.field ?? null
  );
}

/** Label humain du focus courant (sous-titre du stepper). */
export function nextFocusLabel(
  property: PropertyData,
  fieldStatus: FieldStatusMap
): string | null {
  const f = nextFocusField(property, fieldStatus);
  if (!f) return null;
  return PRIORITY_FIELDS.find((p) => p.field === f)?.label ?? null;
}

/**
 * Chips déterministes alignés sur la question : options du PREMIER champ
 * prioritaire non traité. Si ce champ est une saisie libre (adresse, surface…),
 * on renvoie [] — pas de chips pour une question ouverte. L'agent posant les
 * questions dans le MÊME ordre de priorité, les chips collent à ce qu'il demande.
 */
/** Nombre max de suggestions affichées dans l'interview d'estimation. */
export const SUGGESTIONS_MAX = 12;

export function nextSuggestions(
  property: PropertyData,
  fieldStatus: FieldStatusMap
): string[] {
  for (const { field } of PRIORITY_FIELDS) {
    if (isAddressed(property, fieldStatus, field)) continue;
    return FIELD_OPTIONS[field] ?? [];
  }
  return [];
}

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
