import { NextResponse } from "next/server";
import { providersStatus } from "@/lib/providers";
import { getSession } from "@/lib/server/session";
import { r2IsConfigured } from "@/lib/storage/r2";
import { inngestIsConfigured } from "@/lib/jobs/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Un health check ne doit JAMAIS être mis en cache.
const NO_STORE = { "Cache-Control": "no-store" } as const;

// Timeout borné du ping DB : au-delà, on considère la DB down (évite qu'un
// PostgREST/tunnel lent bloque le health et fasse timeouter le load-balancer).
const DB_PING_TIMEOUT_MS = 3_000;

/**
 * Ping DB RÉEL : PostgREST self-hosté (gpu1, `real-estate-agent-db.hearst.app`).
 * Requête la plus légère possible — HEAD sur une table connue, aucune ligne
 * ramenée (`Range: 0-0` + `select=id`). N'expose ni URL ni clé : uniquement
 * up/down + latence. Auth service-role côté serveur (jamais renvoyée au client).
 */
async function pingDb(): Promise<{ status: "up" | "down"; latencyMs: number }> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const startedAt = Date.now();
  if (!url || !key) return { status: "down", latencyMs: 0 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DB_PING_TIMEOUT_MS);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/leads?select=id`, {
      method: "HEAD",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: "0-0",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;
    // PostgREST renvoie 200/206 pour une lecture bornée valide. 2xx = up.
    return { status: res.ok ? "up" : "down", latencyMs };
  } catch {
    // Timeout, DNS, tunnel coupé, connexion refusée → DB injoignable.
    return { status: "down", latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Health check public (route ouverte du proxy). Contrôle RÉEL des composants :
 *   - app    : process vivant (toujours ok si la route répond)
 *   - db     : ping PostgREST gpu1 (up/down + latence) — CRITIQUE
 *   - auth   : JWT_SECRET présent (signature des sessions jose)
 *   - storage: vars R2 présentes (pas d'appel réseau)
 *   - jobs   : Inngest configuré (signing key + event key)
 *
 * HTTP 200 si tout composant CRITIQUE est up, 503 si la DB est down.
 * Ne renvoie JAMAIS de secret ni de détail interne (juste up/down, booléens,
 * latence). `providers` (config des intégrations) n'est exposé QU'à une session
 * valide, comme la version précédente — un anonyme n'apprend rien de l'interne.
 * Reste `no-store`.
 */
export async function GET() {
  const db = await pingDb();

  // Composants non-DB : booléens de présence de config, aucun secret exposé.
  const authReady = Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16);
  const storageReady = r2IsConfigured();
  const jobsReady = inngestIsConfigured();

  // La DB est le seul composant CRITIQUE pour le trafic applicatif : sans elle,
  // aucune requête protégée n'aboutit → on signale l'instance indisponible (503).
  const healthy = db.status === "up";

  // Détail providers = surface interne → réservé aux sessions authentifiées.
  // getSession() est fail-soft ; en cas de pépin on omet simplement `providers`.
  let providers: Record<string, boolean> | undefined;
  try {
    if (await getSession()) providers = providersStatus();
  } catch {
    providers = undefined;
  }

  const body = {
    ok: healthy,
    service: "real-estate-agent",
    checks: {
      app: "up" as const,
      db: db.status,
      dbLatencyMs: db.latencyMs,
      auth: authReady ? ("up" as const) : ("down" as const),
      storage: storageReady ? ("up" as const) : ("down" as const),
      jobs: jobsReady ? ("up" as const) : ("down" as const),
    },
    ...(providers ? { providers } : {}),
  };

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: NO_STORE,
  });
}
