/**
 * Rate-limit helper — Upstash Redis sliding window.
 *
 * Returns true  → request is allowed.
 * Returns false → limit exceeded (caller must return 429).
 *
 * No-op (always true) when UPSTASH_REDIS_REST_URL is not set,
 * so local dev without Redis is never blocked.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Singleton cache — one Ratelimit instance per (limit, windowSec) pair.
const cache = new Map<string, Ratelimit>();

function getRatelimiter(limit: number, windowSec: number): Ratelimit {
  const key = `${limit}:${windowSec}`;
  if (!cache.has(key)) {
    const redis = Redis.fromEnv();
    cache.set(
      key,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
        prefix: "rl",
      })
    );
  }
  return cache.get(key)!;
}

/**
 * @param key       Unique identifier for the resource (e.g. `interview:${userId}`)
 * @param limit     Max requests in the window
 * @param windowSec Window duration in seconds
 * @returns true if the request is allowed, false if rate-limited
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  // No-op when Redis is not configured
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return true;
  }

  try {
    const limiter = getRatelimiter(limit, windowSec);
    const { success } = await limiter.limit(key);
    return success;
  } catch (err) {
    // Fail open — never block the user if Redis is unreachable
    console.warn("[ratelimit] Redis error (fail-open):", err);
    return true;
  }
}
