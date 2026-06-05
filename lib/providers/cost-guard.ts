/**
 * Cost-guard pour les providers PAYANTS (Exa/Tavily/Perplexity, LlamaParse,
 * Apollo/PDL, OpenAI embeddings...).
 *
 * Contrairement à `lib/ratelimit.ts` qui est **fail-OPEN** (laisse passer si
 * Redis est indisponible), ce garde-fou est **fail-CLOSED** : si on ne peut pas
 * vérifier le quota, on REFUSE l'appel payant — on ne dépense jamais à l'aveugle.
 *
 * Trois protections, dans l'ordre :
 *  1. flag d'activation par feature (`enabled`)
 *  2. cache de résultat (un hit = 0 appel payant)
 *  3. compteur quotidien par provider (refus au-delà de `dailyCap`)
 */

import { Redis } from '@upstash/redis';

// Configurable via env : COST_GUARD_FAIL_OPEN=true → autorise les appels payants
// si Redis est injoignable, au lieu de les refuser. Défaut : fail-closed.
const COST_GUARD_FAIL_OPEN = process.env.COST_GUARD_FAIL_OPEN === 'true';

export type PaidCallRefusal = 'disabled' | 'cost_guard_unavailable' | 'daily_cap_reached';

export type PaidCallResult<T> =
  | { ok: true; cached: boolean; data: T }
  | { ok: false; reason: PaidCallRefusal; data: null };

export interface PaidCallOptions {
  /** TTL du cache de résultat, en secondes. */
  ttlSec: number;
  /** Plafond d'appels payants par jour et par provider. */
  dailyCap: number;
  /** Flag d'activation de la feature. `false` → refus immédiat. Défaut: true. */
  enabled?: boolean;
}

/** Abstraction minimale du store, pour rendre le garde testable sans Redis réel. */
export interface CostKV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec: number): Promise<void>;
  /** Incrémente la clé et pose un TTL au premier incrément. Retourne le compteur. */
  incrWithExpiry(key: string, ttlSec: number): Promise<number>;
}

const ONE_DAY_SEC = 86_400;

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * Fabrique un garde lié à un KV donné. `kv === null` → fail-closed total
 * par défaut, ou fail-open si `failOpen === true`.
 *
 * @param failOpen - override du flag env pour les tests unitaires.
 */
export function createCostGuard(kv: CostKV | null, failOpen = COST_GUARD_FAIL_OPEN) {
  async function paidCall<T>(
    provider: string,
    key: string,
    fn: () => Promise<T>,
    opts: PaidCallOptions,
  ): Promise<PaidCallResult<T>> {
    if (opts.enabled === false) {
      return { ok: false, reason: 'disabled', data: null };
    }
    if (!kv) {
      if (failOpen) {
        console.warn(`[cost-guard] Redis absent — fail-open pour ${provider}`);
        const data = await fn();
        return { ok: true, cached: false, data };
      }
      return { ok: false, reason: 'cost_guard_unavailable', data: null };
    }

    const cacheKey = `paid:${provider}:${key}`;
    const counterKey = `paidcount:${provider}:${dayBucket()}`;

    try {
      // 2. cache de résultat
      const cached = await kv.get<T>(cacheKey);
      if (cached !== null && cached !== undefined) {
        return { ok: true, cached: true, data: cached };
      }

      // 3. compteur quotidien (incrément AVANT l'appel → protège des retry storms
      //    sur une API payante qui échoue)
      const count = await kv.incrWithExpiry(counterKey, ONE_DAY_SEC);
      if (count > opts.dailyCap) {
        return { ok: false, reason: 'daily_cap_reached', data: null };
      }
    } catch {
      // erreur store (Redis injoignable)
      if (failOpen) {
        console.warn(`[cost-guard] Redis injoignable — fail-open pour ${provider}`);
        const data = await fn();
        return { ok: true, cached: false, data };
      }
      return { ok: false, reason: 'cost_guard_unavailable', data: null };
    }

    // appel payant réel (les erreurs de `fn` remontent au caller, non cachées)
    const data = await fn();

    // mise en cache best-effort (un échec de cache ne doit pas perdre le résultat)
    try {
      await kv.set(cacheKey, data, opts.ttlSec);
    } catch {
      /* ignore */
    }

    return { ok: true, cached: false, data };
  }

  return { paidCall };
}

// ─── Garde par défaut, branché sur Upstash Redis (lazy) ───────────────────────

function upstashKV(): CostKV | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  const redis = Redis.fromEnv();
  return {
    get: <T>(key: string) => redis.get<T>(key),
    set: async (key, value, ttlSec) => {
      await redis.set(key, value as string, { ex: ttlSec });
    },
    incrWithExpiry: async (key, ttlSec) => {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, ttlSec);
      return count;
    },
  };
}

let _guard: ReturnType<typeof createCostGuard> | null = null;

function defaultGuard() {
  if (!_guard) _guard = createCostGuard(upstashKV());
  return _guard;
}

/**
 * Exécute un appel provider payant sous garde (cache + cap quotidien + flag).
 * Fail-closed : refuse si le store est indisponible.
 */
export function paidCall<T>(
  provider: string,
  key: string,
  fn: () => Promise<T>,
  opts: PaidCallOptions,
): Promise<PaidCallResult<T>> {
  return defaultGuard().paidCall(provider, key, fn, opts);
}
