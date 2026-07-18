/**
 * lib/prospection/criteres-update.ts — LOGIQUE PARTAGÉE de mise à jour PARTIELLE
 * des préférences d'un acquéreur (`prosp_criteres_acquereur`).
 *
 * Source UNIQUE consommée par :
 *   - la route produit PATCH /api/prospection/criteres (session utilisateur) ;
 *   - l'interface gateway `buyers.update_preferences` (agent server-to-server).
 *
 * Zéro duplication divergente : les DEUX chemins valident avec le MÊME schéma
 * Zod (mêmes bornes/enums, miroir des CHECK DB 0043) et construisent le patch
 * avec la MÊME fonction `buildCriterePatch` (delta partiel, pas d'écrasement à
 * null, normalisation `type_bien` en tableau). Toute évolution de règle se fait
 * ici, une fois, pour les deux surfaces.
 *
 * ⚠️ Ce module ne fait AUCUN accès DB et AUCUN owner-check : il valide + façonne
 * uniquement. L'owner-check (`id` + `tenant_id` + `user_id`) et l'écriture
 * restent la responsabilité de chaque appelant (la route produit via la session,
 * la gateway via l'identité DÉRIVÉE DE L'AUTH + le framework d'idempotence).
 */
import { z } from "zod";
import type { TablesUpdate } from "@/lib/supabase/database.types";

export type CritereUpdate = TablesUpdate<"prosp_criteres_acquereur">;

// ─── Vocabulaire de validation (miroir EXACT des CHECK DB) ───────────────────
const PREF = z.enum(["indifferent", "requis", "exclu"]);
const UUID = z.string().uuid();
const PosNum = z.number().finite().nonnegative();
const PosInt = z.number().int().finite().nonnegative();

// Miroir des CHECK migration 0043.
const ALERTE_FREQ = z.enum(["immediate", "quotidien", "hebdo", "off"]);
const URGENCE = z.enum(["faible", "normale", "haute", "urgente"]);
const ExclusionsSchema = z.array(z.string().trim().min(1).max(200)).max(50);
const CriteresSecondairesSchema = z.record(
  z.string().trim().min(1).max(80),
  z.union([z.string().trim().max(200), z.number().finite(), z.boolean()]),
);

// Une zone géographique optionnellement géolocalisée : label + coords + rayon.
const ZoneObjectSchema = z
  .object({
    label: z.string().trim().min(1).optional(),
    cp: z.string().trim().min(1).optional(),
    ville: z.string().trim().min(1).optional(),
    lat: z.number().finite().min(-90).max(90).optional(),
    lng: z.number().finite().min(-180).max(180).optional(),
    rayon_km: z.number().finite().nonnegative().optional(),
  })
  .strict()
  .refine((v) => !!(v.label || v.cp || v.ville), { message: "zone_empty" })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: "coords_invalid" });

// Le formulaire (et un agent) peut envoyer une zone en texte libre → objet { label }.
const ZoneSchema = z.union([
  ZoneObjectSchema,
  z
    .string()
    .trim()
    .min(1)
    .transform((label) => ({ label })),
]);

/**
 * Bloc commun aux champs éditables d'un critère. Partagé par la création (POST)
 * ET l'édition partielle (PATCH / gateway). `nom` est optionnel ici pour être
 * réutilisable en édition ; la création le rend requis via `.required`.
 */
export const critereFields = {
  nom: z.string().trim().min(1).max(200),
  lead_id: UUID.nullish(),
  type_bien: z.union([z.array(z.string().trim().min(1)), z.string().trim().min(1)]).nullish(),
  budget_min: PosNum.nullish(),
  budget_max: PosNum.nullish(),
  surface_min: PosNum.nullish(),
  surface_max: PosNum.nullish(),
  pieces_min: PosInt.nullish(),
  pieces_max: PosInt.nullish(),
  zones: z.array(ZoneSchema).max(50).optional(),
  terrasse: PREF.optional(),
  parking: PREF.optional(),
  ascenseur: PREF.optional(),
  jardin: PREF.optional(),
  piscine: PREF.optional(),
  dpe_max: z.string().trim().min(1).max(2).nullish(),
  alerte_email: z.boolean().optional(),
  alerte_whatsapp: z.boolean().optional(),
  telephone: z.string().trim().min(1).max(32).nullish(),
  // ── 0043 LIVE ──
  alerte_frequence: ALERTE_FREQ.optional(),
  urgence: URGENCE.nullish(),
  exclusions: ExclusionsSchema.optional(),
  criteres_secondaires: CriteresSecondairesSchema.optional(),
} as const;

type RangeShape = {
  budget_min?: number | null;
  budget_max?: number | null;
  surface_min?: number | null;
  surface_max?: number | null;
  pieces_min?: number | null;
  pieces_max?: number | null;
};

/** Bornes croisées min ≤ max (partagées création + édition). */
export function rangeChecks<T extends z.ZodType<RangeShape>>(schema: T) {
  return schema
    .refine((v) => v.budget_min == null || v.budget_max == null || v.budget_min <= v.budget_max, {
      message: "budget_range_invalid",
      path: ["budget_min"],
    })
    .refine((v) => v.surface_min == null || v.surface_max == null || v.surface_min <= v.surface_max, {
      message: "surface_range_invalid",
      path: ["surface_min"],
    })
    .refine((v) => v.pieces_min == null || v.pieces_max == null || v.pieces_min <= v.pieces_max, {
      message: "pieces_range_invalid",
      path: ["pieces_min"],
    });
}

/** Schéma de création (tous les champs, `nom` requis). */
export const CreateCritereSchema = rangeChecks(z.object(critereFields).strict());
export type CreateCritereInput = z.infer<typeof CreateCritereSchema>;

/**
 * Champs éditables en mise à jour partielle (TOUT est optionnel — un champ
 * absent = « ne pas toucher »). PAS d'`id` ici : chaque surface décide comment
 * elle identifie le critère (la route via `id` dans le body, la gateway via
 * `buyer_id`). Réutilisé tel quel par la route ET la gateway.
 */
export const CriterePreferencesFields = {
  nom: critereFields.nom.optional(),
  lead_id: critereFields.lead_id,
  type_bien: critereFields.type_bien,
  budget_min: critereFields.budget_min,
  budget_max: critereFields.budget_max,
  surface_min: critereFields.surface_min,
  surface_max: critereFields.surface_max,
  pieces_min: critereFields.pieces_min,
  pieces_max: critereFields.pieces_max,
  zones: critereFields.zones,
  terrasse: critereFields.terrasse,
  parking: critereFields.parking,
  ascenseur: critereFields.ascenseur,
  jardin: critereFields.jardin,
  piscine: critereFields.piscine,
  dpe_max: critereFields.dpe_max,
  alerte_email: critereFields.alerte_email,
  alerte_whatsapp: critereFields.alerte_whatsapp,
  telephone: critereFields.telephone,
  alerte_frequence: critereFields.alerte_frequence,
  urgence: critereFields.urgence,
  exclusions: critereFields.exclusions,
  criteres_secondaires: critereFields.criteres_secondaires,
} as const;

/** Clés reconnues comme préférences éditables (garde `buildCriterePatch` honnête). */
export const CRITERE_PREFERENCE_KEYS = Object.keys(CriterePreferencesFields) as Array<
  keyof typeof CriterePreferencesFields
>;

/**
 * Schéma PATCH de la route produit : les préférences + `id` obligatoire, bornes
 * croisées appliquées. La gateway compose son propre schéma (buyer_id au lieu
 * d'id) mais réutilise `CriterePreferencesFields` + `rangeChecks` — mêmes règles.
 */
export const UpdateCritereSchema = rangeChecks(
  z.object({ id: UUID, ...CriterePreferencesFields }).strict(),
);
export type UpdateCritereInput = z.infer<typeof UpdateCritereSchema>;

/**
 * Construit le patch d'UPDATE à partir d'un delta déjà validé. RÈGLE CENTRALE
 * (partagée route + gateway) :
 *   - un champ ABSENT (`undefined`) n'est PAS poussé → aucun écrasement implicite ;
 *   - un champ explicitement `null` EST poussé (remise à zéro voulue, ex. dpe_max) ;
 *   - `type_bien` est normalisé en `string[]` (ou `null`) au point de contact.
 * Ne connaît que les clés de préférence : toute autre clé (id/buyer_id, tenant…)
 * est ignorée, jamais écrite via le patch.
 */
export function buildCriterePatch(delta: Record<string, unknown>): CritereUpdate {
  const patch: Record<string, unknown> = {};
  for (const key of CRITERE_PREFERENCE_KEYS) {
    if (!(key in delta)) continue;
    const v = delta[key];
    if (v === undefined) continue;
    if (key === "type_bien") {
      patch.type_bien = v == null ? null : Array.isArray(v) ? v : [v];
    } else {
      patch[key] = v;
    }
  }
  return patch as CritereUpdate;
}
