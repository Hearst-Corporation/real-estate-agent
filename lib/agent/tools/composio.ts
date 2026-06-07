/**
 * lib/agent/tools/composio.ts — Outils agentiques Composio (Gmail + Agenda).
 *
 * Expose deux AgentTool : scan_emails et read_calendar.
 * Consomme lib/providers/composio.ts via fetch REST pur (aucun package npm Composio).
 */

import type { AgentTool, ToolResult } from "@/lib/agent/types";
import {
  connectionStatus,
  fetchEmails,
  findCalendarEvents,
} from "@/lib/providers/composio";

// ─── Messages de dégradation ─────────────────────────────────────────────────

const MSG_NON_CONNECTE_GMAIL: ToolResult = {
  ok: false,
  summary: "Boîte mail non connectée",
  observation:
    "La boîte mail de l'utilisateur n'est pas connectée à Composio (ou l'intégration est indisponible). " +
    "Invite l'utilisateur à la connecter depuis la page Profil avant de réessayer.",
};

const MSG_NON_CONNECTE_CALENDAR: ToolResult = {
  ok: false,
  summary: "Agenda non connecté",
  observation:
    "L'agenda Google de l'utilisateur n'est pas connecté à Composio (ou l'intégration est indisponible). " +
    "Invite l'utilisateur à le connecter depuis la page Profil avant de réessayer.",
};

// ─── Helpers d'extraction de données Composio ────────────────────────────────

/** Extrait une liste d'emails depuis la réponse brute Composio (unknown). */
function extractEmailSummary(raw: unknown): string {
  try {
    if (
      raw !== null &&
      typeof raw === "object" &&
      "data" in raw &&
      raw.data !== null &&
      typeof raw.data === "object"
    ) {
      const data = raw.data as Record<string, unknown>;
      const messages =
        (data["messages"] as unknown[]) ??
        (data["emails"] as unknown[]) ??
        [];
      if (Array.isArray(messages) && messages.length > 0) {
        const lines = messages
          .slice(0, 20)
          .map((m) => {
            if (m === null || typeof m !== "object") return null;
            const msg = m as Record<string, unknown>;
            const from = String(msg["from"] ?? msg["sender"] ?? "—");
            const subject = String(
              msg["subject"] ?? msg["Subject"] ?? "(sans objet)",
            );
            const date = String(msg["date"] ?? msg["Date"] ?? "—");
            const snippet = String(
              msg["snippet"] ?? msg["body_snippet"] ?? "",
            ).slice(0, 120);
            return `• [${date}] De : ${from} | Sujet : ${subject}${snippet ? ` | Aperçu : ${snippet}` : ""}`;
          })
          .filter(Boolean);
        if (lines.length > 0) {
          return `${messages.length} email(s) trouvé(s).\n${lines.join("\n")}`;
        }
      }
    }
  } catch {
    // ignore
  }
  return JSON.stringify(raw).slice(0, 800);
}

/** Extrait une liste d'événements depuis la réponse brute Composio (unknown). */
function extractEventSummary(raw: unknown): string {
  try {
    if (
      raw !== null &&
      typeof raw === "object" &&
      "data" in raw &&
      raw.data !== null &&
      typeof raw.data === "object"
    ) {
      const data = raw.data as Record<string, unknown>;
      const events =
        (data["items"] as unknown[]) ??
        (data["events"] as unknown[]) ??
        [];
      if (Array.isArray(events) && events.length > 0) {
        const lines = events
          .slice(0, 20)
          .map((e) => {
            if (e === null || typeof e !== "object") return null;
            const ev = e as Record<string, unknown>;
            const title = String(
              ev["summary"] ?? ev["title"] ?? "(sans titre)",
            );
            const start = extractDateTime(ev["start"]);
            const end = extractDateTime(ev["end"]);
            return `• ${title} — Début : ${start} | Fin : ${end}`;
          })
          .filter(Boolean);
        if (lines.length > 0) {
          return `${events.length} événement(s) trouvé(s).\n${lines.join("\n")}`;
        }
      }
    }
  } catch {
    // ignore
  }
  return JSON.stringify(raw).slice(0, 800);
}

function extractDateTime(dt: unknown): string {
  if (dt === null || dt === undefined) return "—";
  if (typeof dt === "string") return dt;
  if (typeof dt === "object") {
    const obj = dt as Record<string, unknown>;
    return String(obj["dateTime"] ?? obj["date"] ?? "—");
  }
  return String(dt);
}

// ─── Outil scan_emails ───────────────────────────────────────────────────────

const scanEmailsTool: AgentTool = {
  name: "scan_emails",
  description:
    "Scanne la boîte Gmail de l'utilisateur via Composio et renvoie les emails correspondant aux critères (expéditeur, sujet, requête libre). " +
    "Requiert que l'utilisateur ait connecté son compte Gmail depuis la page Profil.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Requête Gmail libre (ex. 'in:inbox newer_than:7d'). Prioritaire sur from/subject si fournie.",
      },
      from: {
        type: "string",
        description: "Filtre sur l'expéditeur (ex. 'john@example.com').",
      },
      subject: {
        type: "string",
        description: "Filtre sur le sujet (ex. 'rendez-vous').",
      },
      max_results: {
        type: "number",
        description: "Nombre maximum d'emails à retourner (défaut 15).",
      },
    },
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const status = await connectionStatus(ctx.userId);
    if (!status.gmail) {
      return MSG_NON_CONNECTE_GMAIL;
    }

    // Construction de la requête Gmail
    const parts: string[] = [];
    if (typeof args.query === "string" && args.query.trim()) {
      parts.push(args.query.trim());
    } else {
      if (typeof args.from === "string" && args.from.trim()) {
        parts.push(`from:${args.from.trim()}`);
      }
      if (typeof args.subject === "string" && args.subject.trim()) {
        parts.push(`subject:${args.subject.trim()}`);
      }
    }
    const query = parts.length > 0 ? parts.join(" ") : undefined;

    const maxResults =
      typeof args.max_results === "number" && args.max_results > 0
        ? args.max_results
        : undefined;

    const result = await fetchEmails(ctx.userId, { query, maxResults });

    if (!result.ok) {
      return {
        ok: false,
        summary: "Erreur lors de la récupération des emails",
        observation: `Impossible de récupérer les emails depuis Composio. Détail : ${result.error}`,
      };
    }

    const observation = extractEmailSummary(result.data);
    const countMatch = observation.match(/^(\d+)\s+email/);
    const count = countMatch ? countMatch[1] : "plusieurs";

    return {
      ok: true,
      summary: `${count} email(s) récupéré(s)`,
      observation,
    };
  },
};

// ─── Outil read_calendar ─────────────────────────────────────────────────────

const readCalendarTool: AgentTool = {
  name: "read_calendar",
  description:
    "Lit les événements de l'agenda Google de l'utilisateur via Composio sur une plage de dates donnée. " +
    "Requiert que l'utilisateur ait connecté son agenda depuis la page Profil.",
  inputSchema: {
    type: "object",
    properties: {
      time_min: {
        type: "string",
        description:
          "Date/heure de début de la plage (ISO 8601, ex. '2026-06-06T00:00:00Z'). Défaut : maintenant.",
      },
      time_max: {
        type: "string",
        description:
          "Date/heure de fin de la plage (ISO 8601, ex. '2026-06-13T23:59:59Z'). Défaut : +7 jours.",
      },
      max_results: {
        type: "number",
        description: "Nombre maximum d'événements à retourner (défaut 20).",
      },
    },
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const status = await connectionStatus(ctx.userId);
    if (!status.calendar) {
      return MSG_NON_CONNECTE_CALENDAR;
    }

    // Plage par défaut : maintenant → +7 jours
    const now = new Date();
    const plus7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const timeMin =
      typeof args.time_min === "string" && args.time_min.trim()
        ? args.time_min.trim()
        : now.toISOString();

    const timeMax =
      typeof args.time_max === "string" && args.time_max.trim()
        ? args.time_max.trim()
        : plus7.toISOString();

    const maxResults =
      typeof args.max_results === "number" && args.max_results > 0
        ? args.max_results
        : undefined;

    const result = await findCalendarEvents(ctx.userId, {
      timeMin,
      timeMax,
      maxResults,
    });

    if (!result.ok) {
      return {
        ok: false,
        summary: "Erreur lors de la récupération de l'agenda",
        observation: `Impossible de récupérer les événements depuis Composio. Détail : ${result.error}`,
      };
    }

    const observation = extractEventSummary(result.data);
    const countMatch = observation.match(/^(\d+)\s+événement/);
    const count = countMatch ? countMatch[1] : "plusieurs";

    return {
      ok: true,
      summary: `${count} événement(s) récupéré(s)`,
      observation,
    };
  },
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const composioTools: AgentTool[] = [scanEmailsTool, readCalendarTool];
