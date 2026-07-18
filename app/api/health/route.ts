import { NextResponse } from "next/server";
import { providersStatus } from "@/lib/providers";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { r2IsConfigured } from "@/lib/storage/r2";
import { inngestIsConfigured } from "@/lib/jobs/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Un health check ne doit JAMAIS être mis en cache.
const NO_STORE = { "Cache-Control": "no-store" } as const;

// Timeout borné du ping DB : au-delà, on considère la DB down (évite qu'un
// PostgREST/tunnel lent bloque le health et fasse timeouter le load-balancer).
const DB_PING_TIMEOUT_MS = 3_000;

/** État DB distinguant configuration, disponibilité et dégradation — sans faux vert. */
type DbState = "up" | "down" | "unconfigured";

/**
 * Ping DB RÉEL via le client serveur neutre (`getGpu1Admin`). Requête la plus
 * légère possible — lecture bornée d'une seule colonne (`select("id").limit(1)`)
 * sur une table connue, aucune ligne exploitée. N'expose NI URL, NI token, NI
 * nom/fournisseur, NI topologie : uniquement up/down/unconfigured + latence.
 *   - `unconfigured` : aucune credential DB → ni faux vert, ni fuite (état distinct).
 *   - `down`         : client configuré mais requête en erreur/timeout (injoignable).
 *   - `up`           : lecture bornée aboutie.
 * Le timeout intrinsèque du client est doublé d'un abort local borné.
 */
async function pingDb(): Promise<{ status: DbState; latencyMs: number }> {
  const db = getGpu1Admin();
  if (!db) return { status: "unconfigured", latencyMs: 0 };

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DB_PING_TIMEOUT_MS);
  try {
    // Lecture bornée, une seule colonne, une seule ligne max : coût minimal.
    const { error } = await db.from("leads").select("id").limit(1);
    const latencyMs = Date.now() - startedAt;
    // Toute erreur PostgREST (réseau, timeout, tunnel coupé) = DB injoignable.
    return { status: error ? "down" : "up", latencyMs };
  } catch {
    return { status: "down", latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Health check public (route ouverte du proxy). Contrôle RÉEL des composants :
 *   - app    : process vivant (toujours ok si la route répond)
 *   - db     : ping borné via le client serveur (up/down/unconfigured + latence) — CRITIQUE
 *   - auth   : JWT_SECRET présent (signature des sessions jose)
 *   - storage: config objet présente (pas d'appel réseau)
 *   - jobs   : file de tâches configurée (signing key + event key)
 *
 * HTTP 200 si tout composant CRITIQUE est up, 503 si la DB n'est pas up.
 * Ne révèle NI secret, NI URL/token, NI nom de fournisseur, NI topologie privée :
 * uniquement up/down/unconfigured, booléens et latence. `providers` (config des
 * intégrations) n'est exposé QU'à une session valide — un anonyme n'apprend rien
 * de l'interne. Reste `no-store`.
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
