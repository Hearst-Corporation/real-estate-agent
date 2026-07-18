import "server-only";
import type { Gpu1Client } from "@/lib/gpu1";
import { getGpu1Admin } from "@/lib/gpu1";

/**
 * Journal d'audit des événements d'authentification — FAIL-SOFT TOTAL.
 *
 * GARANTIE : si la migration 0036 n'est pas encore appliquée (table absente),
 * ou sur toute autre erreur (réseau, Supabase non configuré, colonne manquante…),
 * `recordAuthEvent` swallow l'erreur silencieusement et retourne sans throw.
 * Il ne bloque JAMAIS le flux d'authentification de l'appelant.
 *
 * La table `auth_audit_log` n'est PAS dans les types générés (même pattern que
 * `user_mfa` / 0035) → on cast le client en `Gpu1Client` non typé.
 *
 * ⚠️  Ne jamais logguer un mot de passe ou un secret dans `meta`.
 *     L'email d'un `login_failed` peut aller dans meta (table verrouillée, forensics) — acceptable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Union des types d'événements d'authentification enregistrables. */
export type AuthEvent =
  | "login"
  | "login_pending_mfa"
  | "login_mfa"
  | "login_failed"
  | "login_mfa_failed"
  | "logout"
  | "mfa_enabled"
  | "mfa_disabled"
  | "mfa_reset";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Longueur maximale conservée pour le User-Agent (tronqué au-delà). */
const UA_MAX_LENGTH = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extrait l'IP et le User-Agent depuis les en-têtes de la requête.
 *
 * IP : première entrée de `x-forwarded-for` (proxy/CDN), sinon `x-real-ip`, sinon null.
 * User-Agent : tronqué à UA_MAX_LENGTH caractères, null si absent.
 */
export function extractClientMeta(req: Request): {
  ip: string | null;
  userAgent: string | null;
} {
  // IP — premier hop de x-forwarded-for (le plus proche du client côté proxy de confiance)
  const xff = req.headers.get("x-forwarded-for");
  let ip: string | null = null;
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    ip = first || null;
  }
  if (!ip) {
    const xri = req.headers.get("x-real-ip")?.trim();
    ip = xri || null;
  }

  // User-Agent — tronqué pour éviter des valeurs pathologiquement longues en DB
  const rawUa = req.headers.get("user-agent");
  const userAgent =
    rawUa ? rawUa.slice(0, UA_MAX_LENGTH) : null;

  return { ip, userAgent };
}

/** Client service-role non typé (table hors types générés). `null` si Supabase non configuré. */
function untypedAdmin(): Gpu1Client<unknown> | null {
  return getGpu1Admin() as Gpu1Client<unknown> | null;
}

// ---------------------------------------------------------------------------
// Enregistrement
// ---------------------------------------------------------------------------

/**
 * Enregistre un événement d'authentification dans `auth_audit_log`.
 *
 * FAIL-SOFT TOTAL : ne lève JAMAIS d'erreur. Toute exception (table absente,
 * réseau, Supabase non configuré) est avalée silencieusement.
 *
 * ⚠️  En environnement serverless (Vercel / Edge), l'`await` est OBLIGATOIRE :
 * un appel non-awaité serait tué dès l'envoi de la réponse HTTP, avant que
 * l'INSERT n'ait eu le temps de partir — l'entrée d'audit serait perdue.
 * L'await garantit que la requête DB est émise avant le return de l'appelant.
 * Cela reste fail-soft : l'erreur éventuelle est swallowed, jamais re-thrown.
 */
export async function recordAuthEvent(params: {
  event: AuthEvent;
  req: Request;
  userId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const sb = untypedAdmin();
  if (!sb) return;

  const { ip, userAgent } = extractClientMeta(params.req);

  try {
    await sb.from("auth_audit_log").insert({
      user_id: params.userId ?? null,
      event: params.event,
      ip,
      user_agent: userAgent,
      meta: params.meta ?? {},
    });
    // On ignore délibérément le retour `{ error }` : même une erreur Supabase
    // (contrainte, table absente, réseau) ne doit pas remonter à l'appelant.
  } catch {
    // Swallow — jamais de throw depuis cette fonction.
  }
}
