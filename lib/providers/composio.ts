/**
 * lib/providers/composio.ts — Client REST Composio (Gmail + Google Calendar).
 *
 * Toutes les fonctions sont défensives : elles ne propagent jamais d'exception
 * (try/catch systématique) et renvoient un objet d'erreur structuré en cas d'échec.
 */

// ─── Constantes ──────────────────────────────────────────────────────────────

const COMPOSIO_BASE_URL = "https://backend.composio.dev";
const COMPOSIO_TIMEOUT_MS = 8000;

const PATHS = {
  link: "/api/v3/connected_accounts/link",
  connectedAccounts: "/api/v3.1/connected_accounts",
  executeAction: (action: string) => `/api/v3/tools/execute/${action}`,
} as const;

const ACTIONS = {
  fetchEmails: "GMAIL_FETCH_EMAILS",
  findEvents: "GOOGLECALENDAR_FIND_EVENT",
  createDraft: "GMAIL_CREATE_EMAIL_DRAFT",
  createEvent: "GOOGLECALENDAR_CREATE_EVENT",
} as const;

const DEFAULTS = {
  emailQuery: "in:inbox newer_than:30d",
  maxEmailResults: 15,
  maxCalendarResults: 20,
} as const;

const DEFAULT_EVENT_DURATION_MINUTES = 30;
const MAX_EVENT_DURATION_HOURS = 24;

// ─── Types internes ───────────────────────────────────────────────────────────

type Toolkit = "gmail" | "googlecalendar";

/** L'API Composio renvoie `toolkit` tantôt comme string, tantôt comme objet
 *  `{ slug: "gmail" }` selon la version d'endpoint. On gère les deux. */
type ComposioToolkitField = string | { slug?: string } | null | undefined;

interface ComposioConnectedAccount {
  id: string;
  toolkit: ComposioToolkitField;
  status: string;
}

/** Normalise le champ toolkit (string ou {slug}) en slug minuscule. */
function toolkitSlug(toolkit: ComposioToolkitField): string {
  if (typeof toolkit === "string") return toolkit.toLowerCase();
  if (toolkit && typeof toolkit === "object" && typeof toolkit.slug === "string") {
    return toolkit.slug.toLowerCase();
  }
  return "";
}

interface ComposioConnectedAccountsResponse {
  items: ComposioConnectedAccount[];
}

interface ComposioLinkResponse {
  redirect_url?: string;
  redirectUrl?: string;
}

// ─── Helper fetch interne ────────────────────────────────────────────────────

async function composioFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const apiKey = process.env.COMPOSIO_API_KEY ?? "";

  const url = `${COMPOSIO_BASE_URL}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(COMPOSIO_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    // AbortError (timeout) ou erreur réseau : on retourne un résultat structuré
    // sans jamais laisser l'exception remonter.
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      status: 0,
      data: { error: isTimeout ? "timeout" : String(err) },
    };
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { ok: res.ok, status: res.status, data };
}

// ─── API publique ─────────────────────────────────────────────────────────────

/** Renvoie true si COMPOSIO_API_KEY est présente dans l'environnement. */
export function composioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

/**
 * Initie une connexion OAuth Composio pour un utilisateur et un toolkit donné.
 * Renvoie { redirectUrl } vers lequel rediriger l'utilisateur,
 * ou { error } si la config est manquante ou si l'appel échoue.
 */
export async function initiateConnection(
  userId: string,
  toolkit: Toolkit,
  callbackUrl: string,
): Promise<{ redirectUrl: string } | { error: string }> {
  try {
    const authConfigEnvKey =
      toolkit === "gmail"
        ? process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID
        : process.env.COMPOSIO_GCAL_AUTH_CONFIG_ID;

    if (!authConfigEnvKey) {
      return { error: "auth_config_manquant" };
    }

    const result = await composioFetch(PATHS.link, {
      method: "POST",
      body: JSON.stringify({
        auth_config_id: authConfigEnvKey,
        user_id: userId,
        callback_url: callbackUrl,
      }),
    });

    if (!result.ok) {
      return { error: `composio_link_failed_${result.status}` };
    }

    const payload = result.data as ComposioLinkResponse;
    const redirectUrl = payload?.redirect_url ?? payload?.redirectUrl;

    if (!redirectUrl) {
      return { error: "redirect_url_absent" };
    }

    return { redirectUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `initiateConnection_exception: ${message}` };
  }
}

/**
 * Retourne l'état de connexion Gmail et Calendar pour un userId donné.
 * En cas d'erreur réseau, renvoie { gmail: false, calendar: false }.
 */
export async function connectionStatus(
  userId: string,
): Promise<{ gmail: boolean; calendar: boolean }> {
  try {
    const params = new URLSearchParams();
    params.set("user_ids[]", userId);
    params.set("statuses[]", "ACTIVE");

    const result = await composioFetch(
      `${PATHS.connectedAccounts}?${params.toString()}`,
    );

    if (!result.ok) {
      return { gmail: false, calendar: false };
    }

    const payload = result.data as ComposioConnectedAccountsResponse;
    const items: ComposioConnectedAccount[] = Array.isArray(payload?.items)
      ? payload.items
      : [];

    const gmail = items.some(
      (a) => toolkitSlug(a.toolkit) === "gmail" && a.status === "ACTIVE",
    );
    const calendar = items.some(
      (a) => toolkitSlug(a.toolkit) === "googlecalendar" && a.status === "ACTIVE",
    );

    return { gmail, calendar };
  } catch {
    return { gmail: false, calendar: false };
  }
}

/**
 * Récupère les emails Gmail d'un utilisateur via Composio.
 * query : syntaxe Gmail (ex. "from:john@example.com subject:rdv").
 * maxResults : nombre max d'emails (défaut 15).
 */
export async function fetchEmails(
  userId: string,
  params: { query?: string; maxResults?: number } = {},
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const query = params.query ?? DEFAULTS.emailQuery;
    const maxResults = params.maxResults ?? DEFAULTS.maxEmailResults;

    const result = await composioFetch(
      PATHS.executeAction(ACTIONS.fetchEmails),
      {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          arguments: { query, max_results: maxResults },
        }),
      },
    );

    if (!result.ok) {
      return { ok: false, error: `fetchEmails_failed_${result.status}` };
    }

    return { ok: true, data: result.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `fetchEmails_exception: ${message}` };
  }
}

/**
 * Crée un BROUILLON d'email Gmail via Composio.
 * Ne déclenche PAS d'envoi — le brouillon est consultable/modifiable dans Gmail.
 */
export async function createGmailDraft(
  userId: string,
  params: { to: string; subject: string; body: string },
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const result = await composioFetch(
      PATHS.executeAction(ACTIONS.createDraft),
      {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          arguments: {
            recipient_email: params.to,
            subject: params.subject,
            body: params.body,
          },
        }),
      },
    );

    if (!result.ok) {
      return { ok: false, error: `createGmailDraft_failed_${result.status}` };
    }

    return { ok: true, data: result.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `createGmailDraft_exception: ${message}` };
  }
}

/**
 * Crée un événement dans Google Calendar (agenda "primary") via Composio.
 * startIso / endIso : ISO 8601 avec offset (ex. "2026-06-10T14:00:00+02:00").
 * attendees : liste d'emails optionnelle.
 */
export async function createCalendarEvent(
  userId: string,
  params: {
    summary: string;
    startIso: string;
    endIso: string;
    description?: string;
    attendees?: string[];
  },
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const start = new Date(params.startIso);
    const end = new Date(params.endIso);
    // start_datetime NAÏF (wall-clock UTC, sans Z) + timezone="UTC" → instant non ambigu.
    const startNaive = Number.isNaN(start.getTime())
      ? params.startIso
      : start.toISOString().slice(0, 19);
    // Durée depuis start/end → heures (0-24) + minutes (0-59). Défaut 30 min.
    let durationHour = 0;
    let durationMinutes = DEFAULT_EVENT_DURATION_MINUTES;
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      const totalMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
      durationHour = Math.min(MAX_EVENT_DURATION_HOURS, Math.floor(totalMinutes / 60));
      durationMinutes = totalMinutes % 60;
    }
    const body: Record<string, unknown> = {
      calendar_id: "primary",
      summary: params.summary,
      start_datetime: startNaive,
      timezone: "UTC",
      event_duration_hour: durationHour,
      event_duration_minutes: durationMinutes,
    };

    if (params.description) {
      body["description"] = params.description;
    }

    // Composio attend des emails (strings), pas des objets {email}.
    if (Array.isArray(params.attendees) && params.attendees.length > 0) {
      const emails = params.attendees.filter(
        (e): e is string => typeof e === "string" && e.trim().length > 0,
      );
      if (emails.length > 0) body["attendees"] = emails;
    }

    const result = await composioFetch(
      PATHS.executeAction(ACTIONS.createEvent),
      {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          arguments: body,
        }),
      },
    );

    if (!result.ok) {
      return {
        ok: false,
        error: `createCalendarEvent_failed_${result.status}`,
      };
    }

    return { ok: true, data: result.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `createCalendarEvent_exception: ${message}` };
  }
}

/**
 * Récupère les événements Google Calendar d'un utilisateur via Composio.
 * timeMin / timeMax : ISO 8601. maxResults : défaut 20.
 */
export async function findCalendarEvents(
  userId: string,
  params: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  } = {},
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const maxResults = params.maxResults ?? DEFAULTS.maxCalendarResults;

    const result = await composioFetch(
      PATHS.executeAction(ACTIONS.findEvents),
      {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          arguments: {
            calendar_id: "primary",
            time_min: params.timeMin,
            time_max: params.timeMax,
            max_results: maxResults,
            single_events: true,
            order_by: "startTime",
          },
        }),
      },
    );

    if (!result.ok) {
      return { ok: false, error: `findCalendarEvents_failed_${result.status}` };
    }

    return { ok: true, data: result.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `findCalendarEvents_exception: ${message}` };
  }
}
