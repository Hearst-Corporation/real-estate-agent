/**
 * lib/agent/tools/prospection.ts — Outils prospection du chat agentique.
 *
 * Couvre : création de critères acquéreur, liste des critères, liste des matchs.
 * Chaque requête filtre SYSTÉMATIQUEMENT user_id + tenant_id.
 * Schémas JSON Kimi-safe : aucun type-array, aucun oneOf.
 */

import type { AgentTool, ToolResult } from "@/lib/agent/types";

// ─── Constantes ───────────────────────────────────────────────────────────────

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

const PREF_VALUES = ["requis", "exclu", "indifferent"] as const;
const DPE_LETTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;

// ─── Helpers (typage défensif des inputs LLM) ─────────────────────────────────

function asString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 ? s : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Entier (colonnes smallint comme pieces_min/max — tronque un éventuel float LLM). */
function asInt(v: unknown): number | undefined {
  const n = asNumber(v);
  return n === undefined ? undefined : Math.trunc(n);
}

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  const s = asString(v);
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
}

function clampLimit(v: unknown): number {
  const n = asNumber(v);
  if (n === undefined) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIST_LIMIT);
}

/** Split CSV → tableau de strings non vides. Ex: "75011,75012" → ["75011","75012"]. */
function splitCsv(v: unknown): string[] {
  const s = asString(v);
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function missing(field: string): ToolResult {
  return {
    ok: false,
    summary: `Champ requis manquant : ${field}`,
    observation: `Impossible : il manque le champ requis « ${field} ». Demande-le à l'utilisateur.`,
  };
}

function dbError(label: string): ToolResult {
  return {
    ok: false,
    summary: `Échec : ${label}`,
    observation: `Échec de l'opération « ${label} » côté base de données. Réessaie ou signale-le.`,
  };
}

// ─── create_critere_prospection ───────────────────────────────────────────────

const createCritereProspection: AgentTool = {
  name: "create_critere_prospection",
  description:
    "Crée un critère de recherche acquéreur pour la prospection automatique. " +
    "Le moteur de matching utilisera ce critère pour alerter l'utilisateur sur les annonces correspondantes. " +
    "Seul « nom » est obligatoire. " +
    "zones : liste CSV de codes postaux (ex: \"75011,75012\"). " +
    "type_bien : liste CSV de types de biens (ex: \"appartement,maison\").",
  inputSchema: {
    type: "object",
    properties: {
      nom: {
        type: "string",
        description: "Nom/libellé du critère (obligatoire). Ex: « Appartement Paris 11e budget 400k ».",
      },
      lead_id: {
        type: "string",
        description: "UUID du lead acquéreur lié (optionnel).",
      },
      budget_min: {
        type: "number",
        description: "Budget minimum en euros (optionnel).",
      },
      budget_max: {
        type: "number",
        description: "Budget maximum en euros (optionnel).",
      },
      surface_min: {
        type: "number",
        description: "Surface minimale en m² (optionnel).",
      },
      surface_max: {
        type: "number",
        description: "Surface maximale en m² (optionnel).",
      },
      pieces_min: {
        type: "number",
        description: "Nombre minimum de pièces (optionnel).",
      },
      pieces_max: {
        type: "number",
        description: "Nombre maximum de pièces (optionnel).",
      },
      zones: {
        type: "string",
        description:
          "Codes postaux séparés par des virgules (optionnel). Ex: \"75011,75012,75013\".",
      },
      type_bien: {
        type: "string",
        description:
          "Types de biens séparés par des virgules (optionnel). Ex: \"appartement,maison\".",
      },
      terrasse: {
        type: "string",
        enum: PREF_VALUES,
        description: "Préférence terrasse : requis | exclu | indifferent (défaut indifferent).",
      },
      parking: {
        type: "string",
        enum: PREF_VALUES,
        description: "Préférence parking : requis | exclu | indifferent (défaut indifferent).",
      },
      ascenseur: {
        type: "string",
        enum: PREF_VALUES,
        description: "Préférence ascenseur : requis | exclu | indifferent (défaut indifferent).",
      },
      jardin: {
        type: "string",
        enum: PREF_VALUES,
        description: "Préférence jardin : requis | exclu | indifferent (défaut indifferent).",
      },
      piscine: {
        type: "string",
        enum: PREF_VALUES,
        description: "Préférence piscine : requis | exclu | indifferent (défaut indifferent).",
      },
      dpe_max: {
        type: "string",
        enum: DPE_LETTERS,
        description: "DPE maximum accepté (A = meilleur). Ex: \"D\" signifie A/B/C/D acceptés.",
      },
      alerte_email: {
        type: "boolean",
        description: "Envoyer des alertes par e-mail (défaut true).",
      },
      alerte_whatsapp: {
        type: "boolean",
        description: "Envoyer des alertes WhatsApp (défaut false).",
      },
      telephone: {
        type: "string",
        description: "Numéro de téléphone pour les alertes WhatsApp (optionnel).",
      },
    },
    required: ["nom"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const nom = asString(args.nom);
    if (!nom) return missing("nom");

    const zonesArr = splitCsv(args.zones);
    const typeBienArr = splitCsv(args.type_bien);

    const row = {
      tenant_id: ctx.tenant,
      user_id: ctx.userId,
      nom,
      lead_id: asString(args.lead_id) ?? null,
      budget_min: asNumber(args.budget_min) ?? null,
      budget_max: asNumber(args.budget_max) ?? null,
      surface_min: asNumber(args.surface_min) ?? null,
      surface_max: asNumber(args.surface_max) ?? null,
      pieces_min: asInt(args.pieces_min) ?? null,
      pieces_max: asInt(args.pieces_max) ?? null,
      zones: zonesArr.length > 0 ? zonesArr : [],
      type_bien: typeBienArr.length > 0 ? typeBienArr : null,
      terrasse: asEnum(args.terrasse, PREF_VALUES) ?? "indifferent",
      parking: asEnum(args.parking, PREF_VALUES) ?? "indifferent",
      ascenseur: asEnum(args.ascenseur, PREF_VALUES) ?? "indifferent",
      jardin: asEnum(args.jardin, PREF_VALUES) ?? "indifferent",
      piscine: asEnum(args.piscine, PREF_VALUES) ?? "indifferent",
      dpe_max: asEnum(args.dpe_max, DPE_LETTERS) ?? null,
      alerte_email: typeof args.alerte_email === "boolean" ? args.alerte_email : true,
      alerte_whatsapp: typeof args.alerte_whatsapp === "boolean" ? args.alerte_whatsapp : false,
      telephone: asString(args.telephone) ?? null,
    };

    const { data, error } = await ctx.sb
      .from("prosp_criteres_acquereur")
      .insert(row)
      .select("id")
      .single();

    if (error || !data) return dbError("création du critère de prospection");

    const budgetInfo =
      row.budget_min !== null || row.budget_max !== null
        ? ` budget ${row.budget_min ?? "?"} – ${row.budget_max ?? "?"} €`
        : "";
    const zonesInfo = zonesArr.length > 0 ? ` zones [${zonesArr.join(", ")}]` : "";

    return {
      ok: true,
      summary: `Critère « ${nom} » créé`,
      observation:
        `Critère de prospection « ${nom} » créé (id ${data.id})${budgetInfo}${zonesInfo}. ` +
        `Le moteur de matching alertera automatiquement pour les nouvelles annonces correspondantes.`,
    };
  },
};

// ─── list_criteres_prospection ────────────────────────────────────────────────

const listCriteresProspection: AgentTool = {
  name: "list_criteres_prospection",
  description:
    "Liste les critères de recherche acquéreur actifs de l'utilisateur. " +
    "Utilise-le pour retrouver un id avant une mise à jour ou pour informer l'utilisateur de ses critères en cours.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: `Nombre max de résultats (défaut ${DEFAULT_LIST_LIMIT}).`,
      },
    },
    required: [],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const limit = clampLimit(args.limit);

    const { data, error } = await ctx.sb
      .from("prosp_criteres_acquereur")
      .select(
        "id, nom, budget_min, budget_max, surface_min, type_bien, zones, actif, created_at"
      )
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenant)
      .eq("actif", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return dbError("lecture des critères de prospection");

    const rows = data ?? [];

    if (rows.length === 0) {
      return {
        ok: true,
        summary: "Aucun critère",
        observation:
          "Aucun critère de prospection actif trouvé. " +
          "Utilise create_critere_prospection pour en créer un.",
      };
    }

    const lines = rows
      .map((r) => {
        const budget =
          r.budget_min !== null || r.budget_max !== null
            ? ` | budget ${r.budget_min ?? "?"} – ${r.budget_max ?? "?"} €`
            : "";
        const surface = r.surface_min !== null ? ` | surface ≥ ${r.surface_min} m²` : "";
        const zones = Array.isArray(r.zones) && r.zones.length > 0
          ? ` | zones [${(r.zones as string[]).join(", ")}]`
          : "";
        const types = Array.isArray(r.type_bien) && r.type_bien.length > 0
          ? ` | ${(r.type_bien as string[]).join("/")} `
          : "";
        return `- « ${r.nom} »${types}${budget}${surface}${zones} [${r.id}]`;
      })
      .join("\n");

    return {
      ok: true,
      summary: `${rows.length} critère(s) actif(s)`,
      observation: `Critères de prospection actifs (${rows.length}) :\n${lines}`,
    };
  },
};

// ─── list_matchs ──────────────────────────────────────────────────────────────

const listMatchs: AgentTool = {
  name: "list_matchs",
  description:
    "Liste les matchs de prospection (annonces correspondant aux critères acquéreur). " +
    "Triés par score décroissant. " +
    "Filtre optionnel par critere_id pour n'afficher les matchs que d'un critère précis.",
  inputSchema: {
    type: "object",
    properties: {
      critere_id: {
        type: "string",
        description:
          "UUID du critère pour filtrer (optionnel). Retrouve-le via list_criteres_prospection.",
      },
      limit: {
        type: "number",
        description: `Nombre max de résultats (défaut ${DEFAULT_LIST_LIMIT}).`,
      },
    },
    required: [],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const limit = clampLimit(args.limit);
    const critereId = asString(args.critere_id);

    type RawAnnonce = Record<string, unknown> | Record<string, unknown>[] | null;
    type MatchRow = {
      id: string;
      score_match: number;
      statut: string;
      alerted_at: string | null;
      date_match: string;
      annonce_id: string;
      critere_id: string;
      annonce: RawAnnonce;
    };

    let q = ctx.sb
      .from("prosp_matchs")
      .select(
        "id, score_match, statut, alerted_at, date_match, annonce_id, critere_id, " +
        "annonce:prosp_annonces(id, type_bien, title, prix, surface_m2, nb_pieces, code_postal, commune, source_url)"
      )
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenant)
      .order("score_match", { ascending: false })
      .limit(limit);

    if (critereId) {
      q = q.eq("critere_id", critereId);
    }

    const { data: rawData, error } = await q;

    if (error) return dbError("lecture des matchs de prospection");

    const rows = (rawData ?? []) as unknown as MatchRow[];

    if (rows.length === 0) {
      return {
        ok: true,
        summary: "Aucun match",
        observation:
          "Aucun match de prospection trouvé" +
          (critereId ? ` pour le critère ${critereId}` : "") +
          ". La prospection n'a pas encore ingéré d'annonces correspondantes, " +
          "ou aucun critère actif ne génère de correspondance pour le moment.",
      };
    }

    const lines = rows
      .map((r) => {
        const raw = r.annonce;
        const a: Record<string, unknown> | null = Array.isArray(raw)
          ? (raw[0] ?? null)
          : (raw ?? null);

        const type = a ? String(a.type_bien ?? "?") : "?";
        const titre = a ? String(a.title ?? "") : "";
        const prix = a && a.prix !== null && a.prix !== undefined ? ` ${a.prix} €` : "";
        const surface = a && a.surface_m2 !== null && a.surface_m2 !== undefined ? ` ${a.surface_m2} m²` : "";
        const pieces = a && a.nb_pieces !== null && a.nb_pieces !== undefined ? ` ${a.nb_pieces}p` : "";
        const localisation =
          a && (a.code_postal || a.commune)
            ? ` — ${a.commune ?? ""}${a.code_postal ? ` (${a.code_postal})` : ""}`
            : "";
        const alerte = r.alerted_at ? " [alerté]" : "";

        const desc = titre ? ` « ${titre} »` : "";

        return (
          `- score ${r.score_match}/100 | ${type}${desc}${prix}${surface}${pieces}${localisation}` +
          ` | statut ${r.statut}${alerte} [match ${r.id}]`
        );
      })
      .join("\n");

    return {
      ok: true,
      summary: `${rows.length} match(s)`,
      observation:
        `Matchs de prospection (${rows.length})` +
        (critereId ? ` pour critère ${critereId}` : "") +
        ` :\n${lines}`,
    };
  },
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const prospectionTools: AgentTool[] = [
  createCritereProspection,
  listCriteresProspection,
  listMatchs,
];
