/**
 * lib/invest/server/circuit-breaker.ts — Pattern D : fail-soft providers.
 *
 * Calqué sur `lib/providers/cost-guard.ts` (KV injectable + adaptateur Upstash
 * Redis lazy, env lue paresseusement). Protège des appels en cascade vers un
 * provider externe en panne : au-delà de `failureThreshold` échecs dans la
 * fenêtre, le circuit s'OUVRE et on lève `ProviderUnavailableError(provider)`
 * (mappée en 502 par les routes) SANS appeler `fn`. Après `cooldownSec`, on
 * passe en HALF-OPEN : un seul essai sonde le provider — succès → fermeture,
 * échec → réouverture pleine.
 *
 * États :
 *   - closed     : appels normaux ; on compte les échecs.
 *   - open        : on refuse tout (jusqu'à expiration du cooldown).
 *   - half-open   : un essai de sonde autorisé.
 *
 * ⚠️ Le breaker ne fait AUCUNE arithmétique de temps : le cooldown est porté par
 * le TTL du marqueur d'ouverture côté store (Redis `EX`), exactement comme le
 * cap quotidien de cost-guard s'appuie sur le TTL Redis. La distinction
 * open/half-open est dérivée de l'état du store :
 *   - marqueur d'ouverture PRÉSENT                         → open
 *   - marqueur ABSENT mais échecs ≥ seuil (cooldown écoulé) → half-open (1 sonde)
 *   - sinon                                                 → closed
 * Ce modèle est testable avec un KV mock sans injecter d'horloge.
 *
 * Sans Redis (kv === null) → FAIL-SOFT : on laisse passer (comme
 * `lib/ratelimit.ts` est fail-open). On préfère tenter l'appel plutôt que de
 * couper un provider sain faute de mémoire d'état partagée.
 */

import { Redis } from "@upstash/redis";
import { ProviderUnavailableError } from "../shared/errors";

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerRunOptions {
  /** Nombre d'échecs consécutifs avant ouverture. */
  failureThreshold: number;
  /** Durée d'ouverture (s) — portée par le TTL du marqueur côté store. */
  cooldownSec: number;
}

/**
 * Abstraction minimale du store, pour rendre le breaker testable sans Redis réel.
 * Le store porte la sémantique temporelle via le TTL de `markOpen` (le marqueur
 * d'ouverture s'auto-efface après `cooldownSec`).
 */
export interface BreakerKV {
  /** Incrémente le compteur d'échecs (TTL au 1er incrément). Retourne le total. */
  incrFailures(provider: string, ttlSec: number): Promise<number>;
  /** Lit le compteur d'échecs courant (0 si absent/expiré). */
  getFailures(provider: string): Promise<number>;
  /** true si le marqueur d'ouverture est encore présent (cooldown non écoulé). */
  isOpen(provider: string): Promise<boolean>;
  /** Pose le marqueur d'ouverture avec un TTL = `cooldownSec`. */
  markOpen(provider: string, cooldownSec: number): Promise<void>;
  /** Succès : efface échecs + marqueur d'ouverture (retour à closed). */
  reset(provider: string): Promise<void>;
}

/** Fenêtre de comptage des échecs (s). Au-delà, le compteur s'efface tout seul. */
const FAILURE_WINDOW_SEC = 120;

/**
 * Fabrique un breaker lié à un KV donné. `kv === null` → fail-soft : `run`
 * exécute toujours `fn` sans mémoire d'état (cf. en-tête).
 */
export function createCircuitBreaker(kv: BreakerKV | null) {
  /**
   * État logique courant, dérivé du store (cf. en-tête).
   * @internal exposé surtout pour les tests.
   */
  async function state(provider: string): Promise<BreakerState> {
    if (!kv) return "closed";
    if (await kv.isOpen(provider)) return "open";
    return "closed";
  }

  /**
   * Phase d'exécution courante :
   *  - "blocked"  : circuit ouvert → refuser ;
   *  - "probe"    : half-open → autoriser 1 sonde ;
   *  - "normal"   : closed.
   */
  async function phase(
    provider: string,
    threshold: number,
  ): Promise<"blocked" | "probe" | "normal"> {
    if (await kv!.isOpen(provider)) return "blocked";
    // Marqueur d'ouverture absent : si on garde des échecs ≥ seuil, c'est que le
    // cooldown vient de s'écouler → la prochaine requête est la sonde half-open.
    const failures = await kv!.getFailures(provider);
    if (failures >= threshold) return "probe";
    return "normal";
  }

  async function run<T>(
    provider: string,
    fn: () => Promise<T>,
    opts: BreakerRunOptions,
  ): Promise<T> {
    if (!kv) {
      // Fail-soft : pas de store d'état partagé → on tente l'appel.
      return fn();
    }

    let current: "blocked" | "probe" | "normal";
    try {
      current = await phase(provider, opts.failureThreshold);
    } catch (err) {
      // Erreur de lecture du store → fail-soft : on laisse passer l'appel.
      console.warn(`[circuit-breaker] KV illisible — fail-soft pour ${provider}`, err);
      return fn();
    }

    if (current === "blocked") {
      // OPEN : on refuse sans toucher au provider (→ 502 côté route).
      throw new ProviderUnavailableError(provider);
    }

    const probing = current === "probe";

    try {
      const result = await fn();
      // Succès → on referme le circuit (efface échecs + marqueur d'ouverture).
      try {
        await kv.reset(provider);
      } catch {
        /* best-effort : un échec de reset ne doit pas perdre le résultat */
      }
      return result;
    } catch (err) {
      // Échec applicatif de `fn`.
      try {
        if (probing) {
          // La sonde half-open a échoué → réouverture pleine (nouveau cooldown).
          await kv.markOpen(provider, opts.cooldownSec);
        } else {
          const failures = await kv.incrFailures(provider, FAILURE_WINDOW_SEC);
          if (failures >= opts.failureThreshold) {
            await kv.markOpen(provider, opts.cooldownSec);
          }
        }
      } catch {
        /* best-effort : ne pas masquer l'erreur d'origine par une erreur de KV */
      }
      throw err;
    }
  }

  return { run, state };
}

// ─── Breaker par défaut, branché sur Upstash Redis (lazy) ─────────────────────

function failuresKey(provider: string): string {
  return `breaker:fail:${provider}`;
}
function openKey(provider: string): string {
  return `breaker:open:${provider}`;
}

function upstashBreakerKV(): BreakerKV | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  const redis = Redis.fromEnv();
  return {
    incrFailures: async (provider, ttlSec) => {
      const count = await redis.incr(failuresKey(provider));
      if (count === 1) await redis.expire(failuresKey(provider), ttlSec);
      return count;
    },
    getFailures: async (provider) => {
      const v = await redis.get<number>(failuresKey(provider));
      return typeof v === "number" ? v : 0;
    },
    isOpen: async (provider) => {
      // Le marqueur a un TTL = cooldown ; sa simple présence = circuit ouvert.
      const v = await redis.get<number>(openKey(provider));
      return v != null;
    },
    markOpen: async (provider, cooldownSec) => {
      await redis.set(openKey(provider), 1, { ex: cooldownSec });
    },
    reset: async (provider) => {
      await redis.del(failuresKey(provider), openKey(provider));
    },
  };
}

let _breaker: ReturnType<typeof createCircuitBreaker> | null = null;

function defaultBreaker() {
  if (!_breaker) _breaker = createCircuitBreaker(upstashBreakerKV());
  return _breaker;
}

/**
 * Exécute un appel provider sous disjoncteur (Pattern D). Lève
 * `ProviderUnavailableError(provider)` (→ 502) si le circuit est ouvert.
 * Fail-soft si Redis est absent.
 */
export function runWithBreaker<T>(
  provider: string,
  fn: () => Promise<T>,
  opts: BreakerRunOptions,
): Promise<T> {
  return defaultBreaker().run(provider, fn, opts);
}
