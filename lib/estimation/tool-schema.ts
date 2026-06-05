// ─── Anthropic tool definition for record_property_data ──────────────────────

export const recordPropertyDataTool = {
  name: 'record_property_data' as const,
  description:
    "N'émets QUE les champs appris ce tour ; pour une donnée que le vendeur ignore, ajoute son nom à to_confirm[] et N'inclus PAS la clé ; n'invente jamais.",
  input_schema: {
    type: 'object' as const,
    properties: {
      type_bien: {
        type: 'string',
        enum: [
          'appartement',
          'maison',
          'immeuble',
          'local_commercial',
          'terrain',
          'autre',
        ],
        description: 'Type de bien immobilier',
      },
      adresse: {
        type: 'string',
        description: "Adresse complète (numéro, rue)",
      },
      ville: {
        type: 'string',
        description: 'Ville',
      },
      code_postal: {
        type: 'string',
        description: 'Code postal',
      },
      secteur: {
        type: 'string',
        description: 'Secteur ou quartier',
      },
      surface_habitable_m2: {
        type: 'number',
        minimum: 1,
        maximum: 100000,
        description: 'Surface habitable en m²',
      },
      surface_carrez_m2: {
        type: 'number',
        minimum: 1,
        maximum: 100000,
        description: 'Surface Carrez en m²',
      },
      surface_carrez_confirmee: {
        type: 'boolean',
        description: 'Surface Carrez confirmée par un mesurage récent',
      },
      nombre_pieces: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Nombre de pièces principales',
      },
      nombre_chambres: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description: 'Nombre de chambres',
      },
      etage: {
        type: 'integer',
        minimum: -5,
        maximum: 200,
        description: "Étage du bien",
      },
      nb_etages_total: {
        type: 'integer',
        minimum: 0,
        maximum: 200,
        description: "Nombre d'étages total de l'immeuble ou niveaux si maison",
      },
      ascenseur: {
        type: 'boolean',
        description: "Présence d'un ascenseur",
      },
      vue: {
        type: 'string',
        description: 'Vue depuis le bien (mer, montagne, dégagée, sur rue, vis-à-vis, parc…)',
      },
      exposition: {
        type: 'string',
        enum: [
          'nord',
          'sud',
          'est',
          'ouest',
          'sud_est',
          'sud_ouest',
          'nord_est',
          'nord_ouest',
          'traversant',
        ],
        description: 'Exposition principale',
      },
      luminosite: {
        type: 'string',
        description: 'Luminosité générale du bien',
      },
      hauteur_sous_plafond_m: {
        type: 'number',
        minimum: 1,
        maximum: 20,
        description: 'Hauteur sous plafond en mètres',
      },
      stationnement: {
        type: 'string',
        enum: ['aucun', 'place_exterieure', 'place_sous_sol', 'box', 'garage', 'plusieurs'],
        description: 'Type de stationnement',
      },
      nb_stationnements: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description: 'Nombre de places de stationnement',
      },
      cave: {
        type: 'boolean',
        description: "Présence d'une cave",
      },
      cave_surface_m2: {
        type: 'number',
        minimum: 1,
        maximum: 100000,
        description: 'Surface de la cave en m²',
      },
      terrasse_balcon_m2: {
        type: 'number',
        minimum: 1,
        maximum: 100000,
        description: 'Surface de terrasse / balcon / loggia en m²',
      },
      jardin_m2: {
        type: 'number',
        minimum: 1,
        maximum: 100000,
        description: 'Surface du jardin privatif en m²',
      },
      etat_general: {
        type: 'string',
        enum: ['a_renover', 'rafraichissement', 'bon', 'renove_recemment', 'neuf'],
        description: 'État général du bien',
      },
      annee_renovation: {
        type: 'integer',
        minimum: 1800,
        maximum: 2100,
        description: 'Année de rénovation',
      },
      qualite_renovation: {
        type: 'string',
        enum: ['superficielle', 'structurelle'],
        description: 'Qualité de la rénovation',
      },
      meuble: {
        type: 'boolean',
        description: 'Bien meublé',
      },
      meuble_inclus: {
        type: 'boolean',
        description: 'Mobilier inclus dans la vente',
      },
      dpe_classe: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
        description: 'Classe DPE',
      },
      ges_classe: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
        description: 'Classe GES',
      },
      annee_dpe: {
        type: 'integer',
        minimum: 2006,
        maximum: 2100,
        description: 'Année du diagnostic DPE',
      },
      etat_copropriete: {
        type: 'string',
        description: 'État des parties communes, façade et toiture',
      },
      nombre_lots: {
        type: 'integer',
        minimum: 0,
        maximum: 10000,
        description: 'Nombre de lots dans la copropriété',
      },
      charges_annuelles_eur: {
        type: 'number',
        minimum: 0,
        maximum: 1000000,
        description: 'Charges annuelles de copropriété en €',
      },
      travaux_votes: {
        type: 'boolean',
        description: "Travaux votés en assemblée générale ou appels de fonds prévus",
      },
      standing_style: {
        type: 'string',
        description:
          "Style architectural ou standing (haussmannien, Art Déco, contemporain…)",
      },
      prestations: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Prestations particulières (moulures, cheminées, parquet, piscine…)',
      },
      nuisances: {
        type: 'string',
        description: 'Nuisances connues (bruit, vis-à-vis, voie ferrée…)',
      },
      motif_vente: {
        type: 'string',
        description: 'Motif de la vente (succession, séparation, déménagement…)',
      },
      delai_souhaite: {
        type: 'string',
        description: 'Délai souhaité pour la vente',
      },
      occupation: {
        type: 'string',
        enum: ['libre', 'loue', 'residence_principale'],
        description: 'Occupation actuelle du bien',
      },
      loyer_mensuel_eur: {
        type: 'number',
        minimum: 0,
        maximum: 1000000,
        description: 'Loyer mensuel en € (si bien loué)',
      },
      commentaires: {
        type: 'string',
        description: 'Commentaires libres supplémentaires',
      },
      to_confirm: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Noms des champs que le vendeur ne connaît pas et qui sont à confirmer ultérieurement",
      },
      current_block: {
        type: 'integer',
        minimum: 1,
        maximum: 9,
        description: "Index du bloc d'interview en cours (1–9)",
      },
      suggestions: {
        type: 'array',
        items: { type: 'string' },
        description:
          "2 à 6 réponses rapides cliquables proposées au vendeur pour la dernière question posée (ex: pour le type de bien → ['Appartement','Maison','Terrain']). Réponses COURTES (1-3 mots). Émets-les à CHAQUE tour où une question fermée ou semi-ouverte est posée. Omets ce champ si la question est purement libre (adresse, commentaires).",
      },
    },
    additionalProperties: false,
  },
} as const;

export type RecordPropertyDataTool = typeof recordPropertyDataTool;
