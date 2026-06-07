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
import { signShareToken } from "@/lib/estimation/share";
import { sendEmail } from "@/lib/providers/resend-email";

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

const createPropertyFromEstimation: AgentTool = {
  name: "create_property_from_estimation",
  description:
    "Crée une fiche bien (property) à partir d'une estimation existante (reprend type, adresse, surface, valeur estimée…). Utilise l'estimationId du contexte. Exige une adresse, une ville et un code postal renseignés dans l'estimation.",
  inputSchema: {
    type: "object",
    properties: { estimationId: { type: "string", description: "UUID de l'estimation source (obligatoire)." } },
    required: ["estimationId"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const estimationId = typeof args.estimationId === "string" ? args.estimationId.trim() : "";
    if (!estimationId) return { ok: false, summary: "Estimation manquante", observation: "Précise l'estimation source." };
    const estimation = await loadOwnedEstimation(ctx.sb, estimationId, ctx.userId, ctx.tenant).catch(() => null);
    if (!estimation) return { ok: false, summary: "Estimation introuvable", observation: "Estimation introuvable pour cet utilisateur." };

    const property = (estimation.property ?? {}) as Partial<PropertyData>;
    const address = property.adresse;
    const city = property.ville ?? estimation.city;
    const postalCode = property.code_postal ?? estimation.postal_code;
    if (!address || !city || !postalCode) {
      return { ok: false, summary: "Infos manquantes", observation: "Impossible de créer la fiche : adresse, ville ou code postal absent de l'estimation. Demande-les d'abord." };
    }
    const title = [property.type_bien ?? "Bien", city, property.surface_habitable_m2 ? `${property.surface_habitable_m2} m²` : ""].filter(Boolean).join(" - ");
    const { data, error } = await ctx.sb
      .from("properties")
      .insert({
        user_id: ctx.userId,
        tenant_id: ctx.tenant,
        status: "prospect",
        title,
        property_type: property.type_bien ?? estimation.property_type ?? "autre",
        address,
        city,
        postal_code: postalCode,
        surface: property.surface_habitable_m2 ?? estimation.surface ?? null,
        rooms: property.nombre_pieces ?? null,
        bedrooms: property.nombre_chambres ?? null,
        estimated_value: estimation.market_value,
        estimation_id: estimationId,
        notes: "Fiche créée depuis le chat Cockpit.",
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, summary: "Échec création fiche", observation: "La fiche produit n'a pas pu être créée." };

    return {
      ok: true,
      summary: "Fiche produit créée",
      observation: `Fiche bien créée depuis l'estimation (id ${data.id}). J'ouvre la fiche.`,
      action: { type: "navigate", path: `/properties/${data.id}` },
    };
  },
};

const sendEstimation: AgentTool = {
  name: "send_estimation",
  description:
    "Envoie l'avis de valeur d'une estimation par email (lien de partage signé). DESTRUCTIF (envoi externe) : n'exécute qu'avec confirmed=true après accord. L'avis doit être prêt (statut ready).",
  inputSchema: {
    type: "object",
    properties: {
      estimationId: { type: "string", description: "UUID de l'estimation (obligatoire)." },
      email: { type: "string", description: "Email du destinataire (obligatoire)." },
      confirmed: { type: "boolean", description: "true uniquement après confirmation de l'utilisateur." },
    },
    required: ["estimationId", "email", "confirmed"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const estimationId = typeof args.estimationId === "string" ? args.estimationId.trim() : "";
    const email = typeof args.email === "string" ? args.email.trim() : "";
    if (!estimationId || !email) return { ok: false, summary: "Champ manquant", observation: "Précise l'estimation et l'email du destinataire." };
    if (args.confirmed !== true) {
      return { ok: false, summary: "Confirmation requise", observation: `Envoi NON exécuté. Demande à l'utilisateur de confirmer l'envoi de l'avis à ${email}, puis rappelle avec confirmed=true.` };
    }
    const estimation = await loadOwnedEstimation(ctx.sb, estimationId, ctx.userId, ctx.tenant).catch(() => null);
    if (!estimation) return { ok: false, summary: "Estimation introuvable", observation: "Estimation introuvable." };
    if (estimation.status !== "ready") {
      return { ok: false, summary: "Avis pas prêt", observation: "L'avis de valeur n'est pas encore généré (il faut le statut 'ready'). Génère-le avant l'envoi." };
    }
    let token: string;
    try {
      token = await signShareToken(estimationId);
    } catch {
      return { ok: false, summary: "Partage indisponible", observation: "Le partage n'est pas configuré (secret manquant)." };
    }
    try {
      await sendEmail({
        to: email,
        subject: "Votre avis de valeur",
        html: `<p>Votre avis de valeur est disponible :</p><p><a href="${ctx.origin}/brochure/${token}">Consulter la fiche</a></p>`,
      });
    } catch {
      return { ok: false, summary: "Envoi échoué", observation: "L'email n'a pas pu être envoyé." };
    }
    return { ok: true, summary: `Avis envoyé à ${email}`, observation: `Avis de valeur envoyé à ${email}.` };
  },
};

export const estimationTools: AgentTool[] = [setEstimationField, createPropertyFromEstimation, sendEstimation];
