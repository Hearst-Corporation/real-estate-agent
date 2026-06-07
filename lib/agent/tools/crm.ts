/**
 * lib/agent/tools/crm.ts — Outils CRM du chat agentique.
 *
 * Chaque tool écrit/lit via `ctx.sb` (service-role) en filtrant SYSTÉMATIQUEMENT
 * `user_id = ctx.userId` ET `tenant_id = ctx.tenant`. Les `summary` et
 * `observation` sont en français. Toute erreur DB → { ok:false }.
 */

import type { Database } from "@/lib/supabase/database.types";
import type { AgentTool, ToolResult } from "@/lib/agent/types";

type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

// ─── Constantes (pas de magic number nu) ───────────────────────────────────────

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;
const DEFAULT_VISIT_DURATION_MIN = 30;

const LEAD_STATUSES = ["nouveau", "contacte", "qualifie", "visite", "offre", "gagne", "perdu"] as const;
const LEAD_KINDS = ["acheteur", "vendeur"] as const;
const VISIT_STATUSES = ["planifiee", "confirmee", "realisee", "annulee", "no_show"] as const;

// ─── Helpers d'argument (typage défensif des inputs LLM) ────────────────────────

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

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  const s = asString(v);
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
}

function clampLimit(v: unknown): number {
  const n = asNumber(v);
  if (n === undefined) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIST_LIMIT);
}

/** Réponse standard "il manque un champ requis". */
function missing(field: string): ToolResult {
  return {
    ok: false,
    summary: `Champ requis manquant : ${field}`,
    observation: `Impossible : il manque le champ requis « ${field} ». Demande-le à l'utilisateur.`,
  };
}

/** Réponse standard d'erreur DB. */
function dbError(label: string): ToolResult {
  return {
    ok: false,
    summary: `Échec : ${label}`,
    observation: `Échec de l'opération « ${label} » côté base de données. Réessaie ou signale-le.`,
  };
}

// ─── Leads ──────────────────────────────────────────────────────────────────────

const createLead: AgentTool = {
  name: "create_lead",
  description:
    "Crée un contact (lead) acheteur ou vendeur dans le CRM. full_name est obligatoire.",
  inputSchema: {
    type: "object",
    properties: {
      full_name: { type: "string", description: "Nom complet du contact (obligatoire)." },
      kind: { type: "string", enum: LEAD_KINDS, description: "acheteur ou vendeur (défaut acheteur)." },
      type_personne: { type: "string", enum: ["particulier","professionnel","societe","sci","agence","physique","morale"], description: "Type de personne (défaut particulier). SAS/SCI/société → 'societe' ou 'sci'." },
      email: { type: "string", description: "Email (optionnel)." },
      phone: { type: "string", description: "Téléphone (optionnel)." },
      source: { type: "string", description: "Origine du lead (optionnel)." },
      budget_min: { type: "number", description: "Budget minimum en euros (optionnel)." },
      budget_max: { type: "number", description: "Budget maximum en euros (optionnel)." },
      status: { type: "string", enum: LEAD_STATUSES, description: "Statut (défaut nouveau)." },
      property_id: { type: "string", description: "UUID du bien lié (optionnel)." },
      notes: { type: "string", description: "Notes libres (optionnel)." },
    },
    required: ["full_name"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const full_name = asString(args.full_name);
    if (!full_name) return missing("full_name");

    const row = {
      user_id: ctx.userId,
      tenant_id: ctx.tenant,
      full_name,
      kind: asEnum(args.kind, LEAD_KINDS) ?? "acheteur",
      type_personne: asString(args.type_personne) ?? "particulier",
      email: asString(args.email),
      phone: asString(args.phone),
      source: asString(args.source),
      budget_min: asNumber(args.budget_min),
      budget_max: asNumber(args.budget_max),
      status: asEnum(args.status, LEAD_STATUSES) ?? "nouveau",
      property_id: asString(args.property_id),
      notes: asString(args.notes),
    };

    const { data, error } = await ctx.sb.from("leads").insert(row).select("id").single();
    if (error || !data) return dbError("création du lead");

    return {
      ok: true,
      summary: `Lead ${full_name} créé`,
      observation: `Lead « ${full_name} » créé (id ${data.id}, statut ${row.status}).`,
    };
  },
};

const listLeads: AgentTool = {
  name: "list_leads",
  description:
    "Liste les contacts (leads) du CRM. Filtre status optionnel. Utilise-le pour retrouver un id avant un update.",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: LEAD_STATUSES, description: "Filtrer sur un statut (optionnel)." },
      limit: { type: "number", description: `Nombre max de résultats (défaut ${DEFAULT_LIST_LIMIT}).` },
    },
    required: [],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const limit = clampLimit(args.limit);
    const status = asEnum(args.status, LEAD_STATUSES);

    let q = ctx.sb
      .from("leads")
      .select("id, full_name, email, phone, status, kind, created_at")
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenant)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return dbError("lecture des leads");

    const rows = data ?? [];
    const lines = rows
      .map((r) => `- ${r.full_name} (${r.kind}, ${r.status}) [${r.id}]${r.email ? ` ${r.email}` : ""}${r.phone ? ` ${r.phone}` : ""}`)
      .join("\n");
    return {
      ok: true,
      summary: `${rows.length} lead(s)`,
      observation: rows.length
        ? `Leads (${rows.length})${status ? ` filtrés sur statut ${status}` : ""} :\n${lines}`
        : `Aucun lead trouvé${status ? ` pour le statut ${status}` : ""}.`,
    };
  },
};

const updateLead: AgentTool = {
  name: "update_lead",
  description:
    "Met à jour un lead existant (id obligatoire). Couvre le changement de statut et le lien vers un bien (property_id). N'invente jamais l'id : utilise list_leads d'abord.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "UUID du lead à modifier (obligatoire)." },
      full_name: { type: "string", description: "Nouveau nom (optionnel)." },
      kind: { type: "string", enum: LEAD_KINDS, description: "acheteur ou vendeur (optionnel)." },
      email: { type: "string", description: "Email (optionnel)." },
      phone: { type: "string", description: "Téléphone (optionnel)." },
      source: { type: "string", description: "Origine (optionnel)." },
      budget_min: { type: "number", description: "Budget min (optionnel)." },
      budget_max: { type: "number", description: "Budget max (optionnel)." },
      status: { type: "string", enum: LEAD_STATUSES, description: "Nouveau statut (optionnel)." },
      property_id: { type: "string", description: "UUID du bien à lier (optionnel)." },
      notes: { type: "string", description: "Notes (optionnel)." },
    },
    required: ["id"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const id = asString(args.id);
    if (!id) return missing("id");

    const patch: LeadUpdate = {};
    const full_name = asString(args.full_name);
    if (full_name) patch.full_name = full_name;
    const kind = asEnum(args.kind, LEAD_KINDS);
    if (kind) patch.kind = kind;
    if ("email" in args) patch.email = asString(args.email) ?? null;
    if ("phone" in args) patch.phone = asString(args.phone) ?? null;
    if ("source" in args) patch.source = asString(args.source) ?? null;
    if ("budget_min" in args) patch.budget_min = asNumber(args.budget_min) ?? null;
    if ("budget_max" in args) patch.budget_max = asNumber(args.budget_max) ?? null;
    const status = asEnum(args.status, LEAD_STATUSES);
    if (status) patch.status = status;
    if ("property_id" in args) patch.property_id = asString(args.property_id) ?? null;
    if ("notes" in args) patch.notes = asString(args.notes) ?? null;

    if (Object.keys(patch).length === 0) {
      return {
        ok: false,
        summary: "Aucun champ à mettre à jour",
        observation: "Aucun champ à modifier n'a été fourni en plus de l'id.",
      };
    }

    const { data, error } = await ctx.sb
      .from("leads")
      .update(patch)
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenant)
      .select("id, full_name, status")
      .maybeSingle();
    if (error) return dbError("mise à jour du lead");
    if (!data) {
      return {
        ok: false,
        summary: "Lead introuvable",
        observation: `Aucun lead avec l'id ${id} pour cet utilisateur. Vérifie l'id via list_leads.`,
      };
    }

    return {
      ok: true,
      summary: `Lead ${data.full_name} mis à jour`,
      observation: `Lead « ${data.full_name} » mis à jour (statut ${data.status}).`,
    };
  },
};

const deleteLead: AgentTool = {
  name: "delete_lead",
  description:
    "Supprime définitivement un lead. DESTRUCTIF : n'exécute QUE si confirmed=true. Si l'utilisateur n'a pas confirmé explicitement, appelle-le avec confirmed=false pour obtenir le message de confirmation, ne réessaie qu'après accord. Retrouve l'id via list_leads d'abord.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "UUID du lead à supprimer (obligatoire). Retrouve-le via list_leads." },
      confirmed: { type: "boolean", description: "true uniquement si l'utilisateur a confirmé la suppression." },
    },
    required: ["id", "confirmed"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const id = asString(args.id);
    if (!id) return missing("id");
    if (args.confirmed !== true) {
      return {
        ok: false,
        summary: "Confirmation requise",
        observation: "Suppression NON exécutée. Demande à l'utilisateur de confirmer explicitement, puis rappelle delete_lead avec confirmed=true.",
      };
    }
    const { data, error } = await ctx.sb
      .from("leads")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenant)
      .select("id, full_name")
      .maybeSingle();
    if (error) return dbError("suppression du lead");
    if (!data) {
      return { ok: false, summary: "Lead introuvable", observation: `Aucun lead avec l'id ${id} pour cet utilisateur.` };
    }
    return { ok: true, summary: `Lead ${data.full_name} supprimé`, observation: `Lead « ${data.full_name} » supprimé.` };
  },
};

// ─── Properties ───────────────────────────────────────────────────────────────

const createProperty: AgentTool = {
  name: "create_property",
  description:
    "Crée un bien immobilier. title, property_type, address, city et postal_code sont obligatoires.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Titre / libellé du bien (obligatoire)." },
      property_type: { type: "string", description: "Type de bien (appartement, maison…) (obligatoire)." },
      address: { type: "string", description: "Adresse (obligatoire)." },
      city: { type: "string", description: "Ville (obligatoire)." },
      postal_code: { type: "string", description: "Code postal (obligatoire)." },
      status: { type: "string", description: "Statut (défaut prospect)." },
      surface: { type: "number", description: "Surface en m² (optionnel)." },
      rooms: { type: "number", description: "Nombre de pièces (optionnel)." },
      bedrooms: { type: "number", description: "Nombre de chambres (optionnel)." },
      asking_price: { type: "number", description: "Prix demandé en euros (optionnel)." },
      notes: { type: "string", description: "Notes (optionnel)." },
    },
    required: ["title", "property_type", "address", "city", "postal_code"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const title = asString(args.title);
    if (!title) return missing("title");
    const property_type = asString(args.property_type);
    if (!property_type) return missing("property_type");
    const address = asString(args.address);
    if (!address) return missing("address");
    const city = asString(args.city);
    if (!city) return missing("city");
    const postal_code = asString(args.postal_code);
    if (!postal_code) return missing("postal_code");

    const row = {
      user_id: ctx.userId,
      tenant_id: ctx.tenant,
      title,
      property_type,
      address,
      city,
      postal_code,
      status: asString(args.status) ?? "prospect",
      surface: asNumber(args.surface),
      rooms: asNumber(args.rooms),
      bedrooms: asNumber(args.bedrooms),
      asking_price: asNumber(args.asking_price),
      notes: asString(args.notes),
    };

    const { data, error } = await ctx.sb.from("properties").insert(row).select("id").single();
    if (error || !data) return dbError("création du bien");

    return {
      ok: true,
      summary: `Bien « ${title} » créé`,
      observation: `Bien « ${title} » à ${city} créé (id ${data.id}, statut ${row.status}).`,
    };
  },
};

const listProperties: AgentTool = {
  name: "list_properties",
  description: "Liste les biens immobiliers. Utilise-le pour retrouver l'id d'un bien avant un lien.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: `Nombre max de résultats (défaut ${DEFAULT_LIST_LIMIT}).` },
    },
    required: [],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const limit = clampLimit(args.limit);
    const { data, error } = await ctx.sb
      .from("properties")
      .select("id, title, city, status, asking_price")
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenant)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return dbError("lecture des biens");

    const rows = data ?? [];
    const lines = rows
      .map((r) => `- ${r.title ?? "(sans titre)"} (${r.city ?? "?"}, ${r.status})${r.asking_price ? ` ${r.asking_price} €` : ""} [${r.id}]`)
      .join("\n");
    return {
      ok: true,
      summary: `${rows.length} bien(s)`,
      observation: rows.length ? `Biens (${rows.length}) :\n${lines}` : "Aucun bien trouvé.",
    };
  },
};

// ─── Visits ───────────────────────────────────────────────────────────────────

const createVisit: AgentTool = {
  name: "create_visit",
  description:
    "Planifie une visite / un rendez-vous. scheduled_at (ISO timestamptz) est obligatoire. Le bien (property_id) et le contact (lead_id) sont optionnels : un RDV peut exister sans bien.",
  inputSchema: {
    type: "object",
    properties: {
      scheduled_at: { type: "string", description: "Date/heure ISO 8601 (obligatoire), ex 2026-06-07T15:00:00+02:00." },
      property_id: { type: "string", description: "UUID du bien (optionnel)." },
      lead_id: { type: "string", description: "UUID du contact (optionnel)." },
      duration_min: { type: "number", description: `Durée en minutes (défaut ${DEFAULT_VISIT_DURATION_MIN}).` },
      status: { type: "string", enum: VISIT_STATUSES, description: "Statut (défaut planifiee)." },
      notes: { type: "string", description: "Notes (optionnel)." },
    },
    required: ["scheduled_at"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const scheduled_at = asString(args.scheduled_at);
    if (!scheduled_at) return missing("scheduled_at");
    if (Number.isNaN(Date.parse(scheduled_at))) {
      return {
        ok: false,
        summary: "Date invalide",
        observation: `La date « ${scheduled_at} » n'est pas une date ISO valide. Fournis un format ISO 8601.`,
      };
    }

    const row = {
      user_id: ctx.userId,
      tenant_id: ctx.tenant,
      scheduled_at,
      property_id: asString(args.property_id),
      lead_id: asString(args.lead_id),
      duration_min: asNumber(args.duration_min) ?? DEFAULT_VISIT_DURATION_MIN,
      status: asEnum(args.status, VISIT_STATUSES) ?? "planifiee",
      notes: asString(args.notes),
    };

    const { data, error } = await ctx.sb.from("visits").insert(row).select("id").single();
    if (error || !data) return dbError("création de la visite");

    return {
      ok: true,
      summary: "Visite planifiée",
      observation: `Visite planifiée le ${scheduled_at} (id ${data.id}, durée ${row.duration_min} min, statut ${row.status}).`,
    };
  },
};

const listVisits: AgentTool = {
  name: "list_visits",
  description: "Liste les visites / rendez-vous à venir et passés.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: `Nombre max de résultats (défaut ${DEFAULT_LIST_LIMIT}).` },
    },
    required: [],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const limit = clampLimit(args.limit);
    const { data, error } = await ctx.sb
      .from("visits")
      .select("id, scheduled_at, status, lead_id, property_id, properties(title, city)")
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenant)
      .order("scheduled_at", { ascending: false })
      .limit(limit);
    if (error) return dbError("lecture des visites");

    const rows = data ?? [];
    const lines = rows
      .map((r) => {
        const prop = (r.properties as { title: string | null; city: string | null } | null);
        const where = prop ? ` — ${prop.title ?? "?"} (${prop.city ?? "?"})` : "";
        return `- ${r.scheduled_at} (${r.status})${where} [${r.id}]`;
      })
      .join("\n");
    return {
      ok: true,
      summary: `${rows.length} visite(s)`,
      observation: rows.length ? `Visites (${rows.length}) :\n${lines}` : "Aucune visite trouvée.",
    };
  },
};

// ─── Mandates ─────────────────────────────────────────────────────────────────

const createMandate: AgentTool = {
  name: "create_mandate",
  description:
    "Crée un mandat de vente lié à un bien. property_id est obligatoire (retrouve-le via list_properties).",
  inputSchema: {
    type: "object",
    properties: {
      property_id: { type: "string", description: "UUID du bien (obligatoire)." },
      kind: { type: "string", description: "Type de mandat (simple, exclusif…) (défaut simple)." },
      reference: { type: "string", description: "Référence du mandat (optionnel)." },
      asking_price: { type: "number", description: "Prix demandé en euros (optionnel)." },
      commission_pct: { type: "number", description: "Commission en % (optionnel)." },
      signed_at: { type: "string", description: "Date de signature ISO (optionnel)." },
      expires_at: { type: "string", description: "Date d'expiration ISO (optionnel)." },
      status: { type: "string", description: "Statut (défaut brouillon)." },
      notes: { type: "string", description: "Notes (optionnel)." },
    },
    required: ["property_id"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const property_id = asString(args.property_id);
    if (!property_id) return missing("property_id");

    const row = {
      user_id: ctx.userId,
      tenant_id: ctx.tenant,
      property_id,
      kind: asString(args.kind) ?? "simple",
      reference: asString(args.reference),
      asking_price: asNumber(args.asking_price),
      commission_pct: asNumber(args.commission_pct),
      signed_at: asString(args.signed_at),
      expires_at: asString(args.expires_at),
      status: asString(args.status) ?? "brouillon",
      notes: asString(args.notes),
    };

    const { data, error } = await ctx.sb.from("mandates").insert(row).select("id").single();
    if (error || !data) return dbError("création du mandat");

    return {
      ok: true,
      summary: "Mandat créé",
      observation: `Mandat créé (id ${data.id}, type ${row.kind}, statut ${row.status}).`,
    };
  },
};

const listMandates: AgentTool = {
  name: "list_mandates",
  description: "Liste les mandats de vente.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: `Nombre max de résultats (défaut ${DEFAULT_LIST_LIMIT}).` },
    },
    required: [],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const limit = clampLimit(args.limit);
    const { data, error } = await ctx.sb
      .from("mandates")
      .select("id, reference, status, asking_price, properties(title, city)")
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenant)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return dbError("lecture des mandats");

    const rows = data ?? [];
    const lines = rows
      .map((r) => {
        const prop = (r.properties as { title: string | null; city: string | null } | null);
        const where = prop ? ` — ${prop.title ?? "?"} (${prop.city ?? "?"})` : "";
        return `- ${r.reference ?? "(sans réf.)"} (${r.status})${r.asking_price ? ` ${r.asking_price} €` : ""}${where} [${r.id}]`;
      })
      .join("\n");
    return {
      ok: true,
      summary: `${rows.length} mandat(s)`,
      observation: rows.length ? `Mandats (${rows.length}) :\n${lines}` : "Aucun mandat trouvé.",
    };
  },
};

// ─── Estimations ──────────────────────────────────────────────────────────────

const createEstimation: AgentTool = {
  name: "create_estimation",
  description:
    "Crée une nouvelle estimation (brouillon vide) et renvoie l'utilisateur vers la page de l'entretien d'estimation.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute(_args, ctx): Promise<ToolResult> {
    const { data, error } = await ctx.sb
      .from("estimations")
      .insert({ user_id: ctx.userId, tenant_id: ctx.tenant, status: "draft" })
      .select("id")
      .single();
    if (error || !data) return dbError("création de l'estimation");

    return {
      ok: true,
      summary: "Estimation créée",
      observation: `Estimation (brouillon) créée (id ${data.id}). Navigation vers la page de l'entretien.`,
      action: { type: "navigate", path: `/estimations/${data.id}` },
    };
  },
};

const listEstimations: AgentTool = {
  name: "list_estimations",
  description: "Liste les estimations.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: `Nombre max de résultats (défaut ${DEFAULT_LIST_LIMIT}).` },
    },
    required: [],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const limit = clampLimit(args.limit);
    const { data, error } = await ctx.sb
      .from("estimations")
      .select("id, status, city, property_type, market_value, updated_at")
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenant)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) return dbError("lecture des estimations");

    const rows = data ?? [];
    const lines = rows
      .map((r) => `- ${r.property_type ?? "?"} ${r.city ?? "?"} (${r.status})${r.market_value ? ` ${r.market_value} €` : ""} [${r.id}]`)
      .join("\n");
    return {
      ok: true,
      summary: `${rows.length} estimation(s)`,
      observation: rows.length ? `Estimations (${rows.length}) :\n${lines}` : "Aucune estimation trouvée.",
    };
  },
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const crmTools: AgentTool[] = [
  createLead,
  listLeads,
  updateLead,
  deleteLead,
  createProperty,
  listProperties,
  createVisit,
  listVisits,
  createMandate,
  listMandates,
  createEstimation,
  listEstimations,
];
