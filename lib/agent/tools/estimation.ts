/**
 * lib/agent/tools/estimation.ts — Outil de remplissage de l'entretien d'estimation.
 *
 * Remplace le détecteur regex de l'ancienne route chat : quand l'utilisateur
 * donne une caractéristique du bien (« c'est un T3 de 80 m² au 2e »), le LLM
 * appelle `set_estimation_field` une fois par champ. La valeur est écrite dans
 * l'estimation possédée (user+tenant) ET une action `estimation_field` est émise
 * pour que la fiche se mette à jour en direct (écoutée par la page estimation).
 */

import type { Database, Json } from "@/lib/supabase/database.types";
import type { FieldStatusMap, PropertyData } from "@/lib/estimation/types";
import type { AgentTool, ToolResult } from "@/lib/agent/types";
import { loadOwnedEstimation } from "@/lib/estimation/owned";

const NUMERIC_FIELDS = new Set(["surface_habitable_m2", "nombre_pieces", "nombre_chambres", "etage"]);
const BOOLEAN_FIELDS = new Set(["ascenseur", "cave", "travaux_votes"]);
const KNOWN_FIELDS = [
  "type_bien", "surface_habitable_m2", "nombre_pieces", "nombre_chambres", "etage",
  "ascenseur", "cave", "travaux_votes", "dpe_classe", "etat_general", "occupation",
  "ville", "code_postal", "adresse",
] as const;

const FIELD_LABELS: Record<string, string> = {
  type_bien: "type de bien", surface_habitable_m2: "surface", nombre_pieces: "nombre de pièces",
  nombre_chambres: "nombre de chambres", etage: "étage", ascenseur: "ascenseur", cave: "cave",
  travaux_votes: "travaux votés", dpe_classe: "DPE", etat_general: "état général",
  occupation: "occupation", ville: "ville", code_postal: "code postal", adresse: "adresse",
};

function coerce(field: string, raw: unknown): string | number | boolean | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (NUMERIC_FIELDS.has(field)) {
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  if (BOOLEAN_FIELDS.has(field)) {
    if (typeof raw === "boolean") return raw;
    return /^(true|oui|vrai|1|avec|présent|present)$/i.test(String(raw).trim());
  }
  const s = String(raw).trim();
  return s.length > 0 ? s : undefined;
}

const setEstimationField: AgentTool = {
  name: "set_estimation_field",
  description:
    "Renseigne UN champ de l'estimation en cours pendant l'entretien (type de bien, surface, pièces, chambres, étage, ascenseur, cave, travaux votés, DPE, état général, occupation, ville, code postal, adresse). Utilise l'id de l'estimation courante fourni dans le contexte. Appelle-le une fois par caractéristique donnée par l'utilisateur. N'invente jamais de valeur.",
  inputSchema: {
    type: "object",
    properties: {
      estimationId: { type: "string", description: "UUID de l'estimation courante (fourni dans le contexte)." },
      field: { type: "string", enum: KNOWN_FIELDS, description: "Le champ à renseigner." },
      value: { type: "string", description: "La valeur en texte (ex: 'appartement', '80', 'oui'). Convertie automatiquement selon le champ." },
    },
    required: ["estimationId", "field", "value"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const estimationId = typeof args.estimationId === "string" ? args.estimationId.trim() : "";
    const field = typeof args.field === "string" ? args.field : "";
    if (!estimationId) return { ok: false, summary: "Estimation inconnue", observation: "Aucune estimation courante : impossible de renseigner un champ. L'utilisateur doit être sur une estimation." };
    if (!KNOWN_FIELDS.includes(field as (typeof KNOWN_FIELDS)[number])) {
      return { ok: false, summary: "Champ inconnu", observation: `Champ « ${field} » non reconnu. Champs valides : ${KNOWN_FIELDS.join(", ")}.` };
    }
    const value = coerce(field, args.value);
    if (value === undefined) return { ok: false, summary: "Valeur invalide", observation: `Valeur invalide pour « ${field} ».` };

    const estimation = await loadOwnedEstimation(ctx.sb, estimationId, ctx.userId, ctx.tenant).catch(() => null);
    if (!estimation) return { ok: false, summary: "Estimation introuvable", observation: "Estimation introuvable pour cet utilisateur." };

    const property = { ...((estimation.property ?? {}) as PropertyData), [field]: value };
    const fieldStatus = { ...((estimation.field_status ?? {}) as FieldStatusMap), [field]: "answered" };
    const promoted =
      field === "type_bien" ? { property_type: value as string }
        : field === "surface_habitable_m2" ? { surface: value as number }
          : field === "ville" ? { city: value as string }
            : field === "code_postal" ? { postal_code: value as string }
              : {};

    const { error } = await ctx.sb
      .from("estimations")
      .update({
        property: property as unknown as Json,
        field_status: fieldStatus as unknown as Json,
        ...(promoted as Database["public"]["Tables"]["estimations"]["Update"]),
        status: "interviewing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", estimationId)
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenant);
    if (error) return { ok: false, summary: "Échec d'enregistrement", observation: "Le champ n'a pas pu être enregistré." };

    return {
      ok: true,
      summary: `${FIELD_LABELS[field]} : ${String(value)}`,
      observation: `Champ « ${FIELD_LABELS[field]} » = ${String(value)} enregistré sur l'estimation. Enchaîne ou propose la prochaine info utile.`,
      action: { type: "estimation_field", estimationId, field, value },
    };
  },
};

export const estimationTools: AgentTool[] = [setEstimationField];
