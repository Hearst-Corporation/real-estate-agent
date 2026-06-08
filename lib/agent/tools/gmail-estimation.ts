/**
 * lib/agent/tools/gmail-estimation.ts — Gmail → Estimation V1.
 *
 * Deux outils dédiés (ne surchargent pas scan_emails générique) :
 *  - scan_gmail_estimation_requests : lit Gmail via Composio, filtre les emails
 *    ressemblant à une demande d'estimation, renvoie des CANDIDATS bruts.
 *    L'EXTRACTION fine (nom, surface, adresse…) est faite par le LLM à partir
 *    du contenu retourné — le tool ne devine rien lui-même.
 *  - create_estimation_from_gmail : crée une estimation BROUILLON à partir des
 *    champs confirmés par l'utilisateur. Anti-doublon via messageId stocké dans
 *    le jsonb `property.gmail_source` (aucune migration).
 *
 * Règle produit : JAMAIS de création automatique sans confirmation utilisateur.
 * Le LLM doit afficher une preview et attendre l'accord avant d'appeler le 2e tool.
 */

import type { Database, Json } from "@/lib/supabase/database.types";
import type { PropertyData } from "@/lib/estimation/types";
import type { AgentTool, ToolResult } from "@/lib/agent/types";
import { connectionStatus, fetchEmails } from "@/lib/providers/composio";

// ─── Constantes ────────────────────────────────────────────────────────────────

const MSG_NON_CONNECTE: ToolResult = {
  ok: false,
  summary: "Boîte mail non connectée",
  observation:
    "La boîte Gmail de l'utilisateur n'est pas connectée à Composio. " +
    "Invite l'utilisateur à la connecter depuis la page Profil avant de réessayer.",
};

const DEFAULTS = {
  maxResults: 10,
  daysBack: 30,
} as const;

/** Termes d'INTENTION (estimer/vendre) — nécessaires mais pas suffisants. */
const INTENT_KEYWORDS = [
  "estimation", "estimer", "évaluer", "evaluer", "évaluation", "evaluation",
  "combien vaut", "prix de vente", "vendre", "mettre en vente", "mise en vente",
  "mandat", "avis de valeur", "valuation", "estimate", "sell",
];

/** Termes IMMOBILIERS — au moins un requis pour écarter les faux positifs
 *  (recouvrement, énergie, finance… qui contiennent « estimation »). */
const REALESTATE_KEYWORDS = [
  "bien", "appartement", "appart", "maison", "studio", "immeuble", "villa",
  "local commercial", "terrain", "loft", "duplex", "m²", "m2", "mètres carrés",
  "metres carres", "pièces", "pieces", "chambres", "propriété", "propriete",
  "logement", "résidence", "residence", "property", "house", "flat", "apartment",
];

/** Expressions fortes qui suffisent à elles seules (intention + immo combinés). */
const STRONG_PHRASES = [
  "valeur de mon bien", "valeur du bien", "vendre mon", "vendre ma",
  "estimer mon", "estimer ma", "appartement à vendre", "maison à vendre",
];

// ─── Normalisation des emails Composio ───────────────────────────────────────

type NormalizedEmail = {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
};

/** Extrait une liste d'emails normalisés depuis la réponse brute Composio.
 *  Composio renvoie les champs sender/subject/messageId/preview/messageText. */
function normalizeEmails(raw: unknown): NormalizedEmail[] {
  const out: NormalizedEmail[] = [];
  try {
    if (raw === null || typeof raw !== "object") return out;
    const top = raw as Record<string, unknown>;
    const data =
      top.data && typeof top.data === "object"
        ? (top.data as Record<string, unknown>)
        : top;
    const messages =
      (data["messages"] as unknown[]) ?? (data["emails"] as unknown[]) ?? [];
    if (!Array.isArray(messages)) return out;
    for (const m of messages) {
      if (m === null || typeof m !== "object") continue;
      const msg = m as Record<string, unknown>;
      out.push({
        messageId: String(msg["messageId"] ?? msg["id"] ?? msg["message_id"] ?? ""),
        from: String(msg["sender"] ?? msg["from"] ?? "—"),
        subject: String(msg["subject"] ?? msg["Subject"] ?? "(sans objet)"),
        date: String(msg["messageTimestamp"] ?? msg["date"] ?? msg["Date"] ?? "—"),
        snippet: String(msg["preview"] ?? msg["snippet"] ?? msg["body_snippet"] ?? "").slice(0, 300),
        body: String(msg["messageText"] ?? msg["body"] ?? msg["preview"] ?? "").slice(0, 2000),
      });
    }
  } catch {
    // ignore — on renvoie ce qu'on a
  }
  return out;
}

/** Heuristique déterministe : l'email ressemble-t-il à une demande d'estimation
 *  IMMOBILIÈRE ? Exige une intention (estimer/vendre) ET un terme immobilier,
 *  sauf si une expression forte combine les deux. Retourne un score 0..1.
 *  Le filtre reste volontairement permissif (le LLM tranche ensuite) mais écarte
 *  les faux positifs évidents (recouvrement, énergie, finance). */
function estimationScore(email: NormalizedEmail): number {
  const hay = `${email.subject}\n${email.body}`.toLowerCase();

  const strong = STRONG_PHRASES.some((p) => hay.includes(p));
  if (strong) return 0.9;

  const intentHits = INTENT_KEYWORDS.filter((kw) => hay.includes(kw)).length;
  const realEstateHits = REALESTATE_KEYWORDS.filter((kw) => hay.includes(kw)).length;

  // Sans intention OU sans terme immobilier → pas un candidat.
  if (intentHits === 0 || realEstateHits === 0) return 0;

  // 1 intention + 1 immo = 0.6 ; plus de signaux = score plus haut (plafond 0.95).
  return Math.min(0.95, 0.4 + intentHits * 0.15 + realEstateHits * 0.1);
}

// ─── Outil scan_gmail_estimation_requests ────────────────────────────────────

const scanGmailEstimationRequests: AgentTool = {
  name: "scan_gmail_estimation_requests",
  description:
    "Scanne la boîte Gmail de l'utilisateur (via Composio) et renvoie les emails qui ressemblent à une DEMANDE D'ESTIMATION immobilière (vendeur souhaitant estimer/vendre un bien). " +
    "Renvoie des candidats bruts (expéditeur, sujet, aperçu, contenu). À TOI d'extraire ensuite les informations (nom, email, téléphone, adresse, ville, code postal, type de bien, surface, pièces) depuis le contenu retourné, puis de présenter une PREVIEW à l'utilisateur. " +
    "Ne crée jamais d'estimation directement : attends la confirmation, puis appelle create_estimation_from_gmail.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Requête Gmail libre optionnelle (ex. 'estimation OR vendre'). Si absent, scanne la boîte de réception récente.",
      },
      maxResults: {
        type: "number",
        description: "Nombre max d'emails à analyser (défaut 10).",
      },
      daysBack: {
        type: "number",
        description: "Fenêtre temporelle en jours (défaut 30).",
      },
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    const status = await connectionStatus(ctx.userId);
    if (!status.gmail) return MSG_NON_CONNECTE;

    const maxResults =
      typeof args.maxResults === "number" && args.maxResults > 0
        ? Math.min(args.maxResults, 25)
        : DEFAULTS.maxResults;
    const daysBack =
      typeof args.daysBack === "number" && args.daysBack > 0
        ? Math.min(args.daysBack, 365)
        : DEFAULTS.daysBack;

    const userQuery = typeof args.query === "string" && args.query.trim() ? args.query.trim() : "";
    const query = `in:inbox newer_than:${daysBack}d ${userQuery}`.trim();

    const result = await fetchEmails(ctx.userId, { query, maxResults });
    if (!result.ok) {
      return {
        ok: false,
        summary: "Erreur lecture Gmail",
        observation: `Impossible de récupérer les emails depuis Composio. Détail : ${result.error}`,
      };
    }

    const emails = normalizeEmails(result.data);
    const candidates = emails
      .map((e) => ({ ...e, confidence: estimationScore(e) }))
      .filter((e) => e.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence);

    if (candidates.length === 0) {
      return {
        ok: true,
        summary: "Aucune demande d'estimation détectée",
        observation:
          `Scan de ${emails.length} email(s) sur ${daysBack} jours : aucun ne ressemble à une demande d'estimation. ` +
          "Dis-le simplement à l'utilisateur (ne fabrique pas de candidat).",
      };
    }

    // On renvoie au LLM les candidats avec leur contenu pour qu'il extraie les champs.
    const lines = candidates.map((c, i) => {
      return [
        `### Candidat ${i + 1} (confiance ${c.confidence.toFixed(2)})`,
        `messageId: ${c.messageId}`,
        `De : ${c.from}`,
        `Date : ${c.date}`,
        `Sujet : ${c.subject}`,
        `Contenu : ${c.body}`,
      ].join("\n");
    });

    return {
      ok: true,
      summary: `${candidates.length} demande(s) d'estimation détectée(s)`,
      observation:
        `${candidates.length} email(s) candidat(s) trouvé(s).\n\n${lines.join("\n\n")}\n\n` +
        "INSTRUCTIONS : pour chaque candidat, extrais les champs disponibles (contactName, contactEmail, phone, address, city, postalCode, propertyType, surface, rooms, notes) UNIQUEMENT depuis le contenu — n'invente jamais une valeur absente (laisse vide). " +
        "Présente une PREVIEW claire à l'utilisateur et demande confirmation AVANT de créer quoi que ce soit. Une fois confirmé, appelle create_estimation_from_gmail avec le messageId et les champs extraits.",
    };
  },
};

// ─── Outil create_estimation_from_gmail ──────────────────────────────────────

const TYPE_BIEN_VALUES = new Set([
  "appartement", "maison", "immeuble", "local_commercial", "terrain", "autre",
]);

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const createEstimationFromGmail: AgentTool = {
  name: "create_estimation_from_gmail",
  description:
    "Crée une estimation BROUILLON à partir d'une demande d'estimation reçue par email. " +
    "N'appelle ce tool QU'APRÈS avoir présenté une preview et obtenu la confirmation explicite de l'utilisateur. " +
    "Préremplit uniquement les champs sûrs fournis ; n'invente jamais de donnée. Le contexte email (contact, messageId) est conservé dans l'estimation. Anti-doublon : refuse si une estimation existe déjà pour ce messageId.",
  inputSchema: {
    type: "object",
    properties: {
      messageId: { type: "string", description: "Identifiant Gmail de l'email source (obligatoire, pour l'anti-doublon)." },
      contactName: { type: "string", description: "Nom du contact vendeur." },
      contactEmail: { type: "string", description: "Email du contact." },
      phone: { type: "string", description: "Téléphone si présent." },
      address: { type: "string", description: "Adresse du bien si présente." },
      city: { type: "string", description: "Ville." },
      postalCode: { type: "string", description: "Code postal." },
      propertyType: { type: "string", description: "Type de bien (appartement, maison, immeuble, local_commercial, terrain, autre)." },
      surface: { type: "number", description: "Surface en m²." },
      rooms: { type: "number", description: "Nombre de pièces." },
      notes: { type: "string", description: "Contexte / message libre extrait de l'email." },
    },
    required: ["messageId"],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const messageId = str(args.messageId);
    if (!messageId) {
      return { ok: false, summary: "messageId manquant", observation: "Le messageId de l'email source est obligatoire (anti-doublon)." };
    }

    // ── Anti-doublon : une estimation porte-t-elle déjà ce messageId ? ──────────
    const { data: existing } = await ctx.sb
      .from("estimations")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("tenant_id", ctx.tenant)
      .eq("property->gmail_source->>messageId", messageId)
      .maybeSingle();

    if (existing?.id) {
      return {
        ok: false,
        summary: "Estimation déjà créée",
        observation: `Une estimation existe déjà pour cet email (id ${existing.id}). Ne la recrée pas — propose plutôt de l'ouvrir : /estimations/${existing.id}.`,
        action: { type: "navigate", path: `/estimations/${existing.id}` },
      };
    }

    // ── Champs sûrs ────────────────────────────────────────────────────────────
    const contactName = str(args.contactName);
    const contactEmail = str(args.contactEmail);
    const phone = str(args.phone);
    const address = str(args.address);
    const city = str(args.city);
    const postalCode = str(args.postalCode);
    const rawType = str(args.propertyType)?.toLowerCase() ?? null;
    const propertyType = rawType && TYPE_BIEN_VALUES.has(rawType) ? rawType : null;
    const surface = num(args.surface);
    const rooms = num(args.rooms);
    const emailNotes = str(args.notes);

    // Contexte email lisible dans le champ commentaires (existant, typé).
    const contactLine = [
      contactName ? `Contact : ${contactName}` : null,
      contactEmail ? `Email : ${contactEmail}` : null,
      phone ? `Tél : ${phone}` : null,
    ].filter(Boolean).join(" · ");
    const commentaires = [
      "Source : demande reçue par email (Gmail).",
      contactLine || null,
      emailNotes ? `Message : ${emailNotes}` : null,
    ].filter(Boolean).join("\n");

    // jsonb property : champs bien connus + bloc gmail_source (hors PropertyData → cast).
    const property: Partial<PropertyData> & { gmail_source: Record<string, unknown> } = {
      ...(propertyType ? { type_bien: propertyType as PropertyData["type_bien"] } : {}),
      ...(address ? { adresse: address } : {}),
      ...(city ? { ville: city } : {}),
      ...(postalCode ? { code_postal: postalCode } : {}),
      ...(surface !== null ? { surface_habitable_m2: surface } : {}),
      ...(rooms !== null ? { nombre_pieces: rooms } : {}),
      commentaires,
      gmail_source: {
        messageId,
        contactName,
        contactEmail,
        phone,
        importedAt: new Date().toISOString(),
      },
    };

    const insertRow: Database["public"]["Tables"]["estimations"]["Insert"] = {
      user_id: ctx.userId,
      tenant_id: ctx.tenant,
      status: "draft",
      property: property as unknown as Json,
      ...(propertyType ? { property_type: propertyType } : {}),
      ...(city ? { city } : {}),
      ...(postalCode ? { postal_code: postalCode } : {}),
      ...(surface !== null ? { surface } : {}),
    };

    const { data, error } = await ctx.sb
      .from("estimations")
      .insert(insertRow)
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, summary: "Échec création estimation", observation: `L'estimation n'a pas pu être créée. ${error?.message ?? ""}`.trim() };
    }

    const who = contactName ?? contactEmail ?? "le contact";
    return {
      ok: true,
      summary: `Estimation brouillon créée (${who})`,
      observation:
        `Estimation brouillon créée à partir de l'email (id ${data.id}). ` +
        `Donne le lien à l'utilisateur : /estimations/${data.id}. Elle apparaît dans /estimations.`,
      action: { type: "navigate", path: `/estimations/${data.id}` },
    };
  },
};

export const gmailEstimationTools: AgentTool[] = [
  scanGmailEstimationRequests,
  createEstimationFromGmail,
];
