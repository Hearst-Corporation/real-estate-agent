// lib/supabase/database.types.ts — SHIM DE COMPATIBILITÉ.
//
// Les types DB ont déménagé vers `@/lib/gpu1/database.types`. Ce fichier ne
// fait que les réexporter, le temps que les consommateurs (M02-M07) migrent
// leurs imports. À SUPPRIMER une fois la migration terminée.
export type {
  Json,
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
} from "@/lib/gpu1/database.types";
export { Constants } from "@/lib/gpu1/database.types";
