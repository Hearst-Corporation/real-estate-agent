import { z } from 'zod';

// ─── PropertyData schema ──────────────────────────────────────────────────────

export const PropertyDataSchema = z.object({
  type_bien: z
    .enum(['appartement', 'maison', 'immeuble', 'local_commercial', 'terrain', 'autre'])
    .nullable()
    .optional(),
  adresse: z.string().max(500).nullable().optional(),
  ville: z.string().max(500).nullable().optional(),
  code_postal: z.string().max(10).nullable().optional(),
  secteur: z.string().max(500).nullable().optional(),
  surface_habitable_m2: z.number().min(1).max(100000).nullable().optional(),
  surface_carrez_m2: z.number().min(1).max(100000).nullable().optional(),
  surface_carrez_confirmee: z.boolean().nullable().optional(),
  nombre_pieces: z.number().int().min(1).max(100).nullable().optional(),
  nombre_chambres: z.number().int().min(0).max(100).nullable().optional(),
  etage: z.number().int().min(-5).max(200).nullable().optional(),
  nb_etages_total: z.number().int().min(0).max(200).nullable().optional(),
  ascenseur: z.boolean().nullable().optional(),
  vue: z.string().max(500).nullable().optional(),
  exposition: z
    .enum([
      'nord',
      'sud',
      'est',
      'ouest',
      'sud_est',
      'sud_ouest',
      'nord_est',
      'nord_ouest',
      'traversant',
    ])
    .nullable()
    .optional(),
  luminosite: z.string().max(500).nullable().optional(),
  hauteur_sous_plafond_m: z.number().min(1).max(20).nullable().optional(),
  stationnement: z
    .enum(['aucun', 'place_exterieure', 'place_sous_sol', 'box', 'garage', 'plusieurs'])
    .nullable()
    .optional(),
  nb_stationnements: z.number().int().min(0).max(100).nullable().optional(),
  cave: z.boolean().nullable().optional(),
  cave_surface_m2: z.number().min(1).max(100000).nullable().optional(),
  terrasse_balcon_m2: z.number().min(1).max(100000).nullable().optional(),
  jardin_m2: z.number().min(1).max(100000).nullable().optional(),
  etat_general: z
    .enum(['a_renover', 'rafraichissement', 'bon', 'renove_recemment', 'neuf'])
    .nullable()
    .optional(),
  annee_renovation: z.number().int().min(1800).max(2100).nullable().optional(),
  qualite_renovation: z.enum(['superficielle', 'structurelle']).nullable().optional(),
  meuble: z.boolean().nullable().optional(),
  meuble_inclus: z.boolean().nullable().optional(),
  dpe_classe: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']).nullable().optional(),
  ges_classe: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']).nullable().optional(),
  annee_dpe: z.number().int().min(2006).max(2100).nullable().optional(),
  etat_copropriete: z.string().max(500).nullable().optional(),
  nombre_lots: z.number().int().min(0).max(10000).nullable().optional(),
  charges_annuelles_eur: z.number().min(0).max(1000000).nullable().optional(),
  travaux_votes: z.boolean().nullable().optional(),
  standing_style: z.string().max(500).nullable().optional(),
  prestations: z.array(z.string().max(120)).max(60).optional(),
  nuisances: z.string().max(500).nullable().optional(),
  motif_vente: z.string().max(500).nullable().optional(),
  delai_souhaite: z.string().max(500).nullable().optional(),
  occupation: z.enum(['libre', 'loue', 'residence_principale']).nullable().optional(),
  loyer_mensuel_eur: z.number().min(0).max(1000000).nullable().optional(),
  commentaires: z.string().max(500).nullable().optional(),
});

export type PropertyDataInput = z.infer<typeof PropertyDataSchema>;
