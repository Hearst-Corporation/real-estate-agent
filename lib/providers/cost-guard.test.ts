import { describe, it, expect, vi } from 'vitest';
import { createCostGuard, type CostKV } from './cost-guard';

// KV en mémoire pour les tests (pas de Redis réel).
function memKV(): CostKV {
  const store = new Map<string, unknown>();
  const counters = new Map<string, number>();
  return {
    get: async <T>(key: string) => (store.has(key) ? (store.get(key) as T) : null),
    set: async (key, value) => {
      store.set(key, value);
    },
    incrWithExpiry: async (key) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
  };
}

describe('cost-guard / paidCall', () => {
  it('fail-closed : KV absent → refus (cost_guard_unavailable), fn jamais appelée', async () => {
    const fn = vi.fn(async () => 'data');
    const { paidCall } = createCostGuard(null);
    const r = await paidCall('exa', 'k1', fn, { ttlSec: 60, dailyCap: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('cost_guard_unavailable');
    expect(fn).not.toHaveBeenCalled();
  });

  it('flag off → refus (disabled), fn jamais appelée', async () => {
    const fn = vi.fn(async () => 'data');
    const { paidCall } = createCostGuard(memKV());
    const r = await paidCall('exa', 'k1', fn, { ttlSec: 60, dailyCap: 10, enabled: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('disabled');
    expect(fn).not.toHaveBeenCalled();
  });

  it('cache hit → renvoie la valeur cachée sans rappeler fn', async () => {
    const fn = vi.fn(async () => 'fresh');
    const { paidCall } = createCostGuard(memKV());
    const first = await paidCall('exa', 'same-key', fn, { ttlSec: 60, dailyCap: 10 });
    expect(first.ok && first.cached).toBe(false);
    const second = await paidCall('exa', 'same-key', fn, { ttlSec: 60, dailyCap: 10 });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.cached).toBe(true);
      expect(second.data).toBe('fresh');
    }
    expect(fn).toHaveBeenCalledTimes(1); // 2e appel servi par le cache
  });

  it('cap quotidien atteint → refus, fn non appelée au-delà', async () => {
    const fn = vi.fn(async (i: number) => `data-${i}`);
    const { paidCall } = createCostGuard(memKV());
    // dailyCap=2, clés distinctes pour éviter le cache
    const a = await paidCall('pdl', 'k1', () => fn(1), { ttlSec: 60, dailyCap: 2 });
    const b = await paidCall('pdl', 'k2', () => fn(2), { ttlSec: 60, dailyCap: 2 });
    const c = await paidCall('pdl', 'k3', () => fn(3), { ttlSec: 60, dailyCap: 2 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('daily_cap_reached');
    expect(fn).toHaveBeenCalledTimes(2); // le 3e n'appelle jamais fn
  });
});
