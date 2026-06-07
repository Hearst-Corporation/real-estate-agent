/**
 * lib/invest/server/circuit-breaker.test.ts — Pattern D via KV mock.
 * Couvre : closed pass-through, ouverture au seuil, refus en open,
 * half-open (succès → ferme, échec → rouvre), fail-soft sans KV.
 *
 * Le cooldown est porté par le TTL du marqueur d'ouverture. Le mock simule ce
 * TTL via une horloge fictive `clock.now` (aucune dépendance à Date.now()).
 */

import { describe, it, expect, vi } from "vitest";
import { createCircuitBreaker, type BreakerKV } from "./circuit-breaker";
import { ProviderUnavailableError } from "../shared/errors";

/** KV en mémoire ; le marqueur d'ouverture expire selon l'horloge fictive. */
function memKV(clock: { now: number }): BreakerKV {
  const failures = new Map<string, number>();
  const openUntil = new Map<string, number>(); // provider -> epoch d'expiration
  const openLive = (p: string): boolean => {
    const exp = openUntil.get(p);
    if (exp == null) return false;
    if (clock.now >= exp) {
      openUntil.delete(p);
      return false;
    }
    return true;
  };
  return {
    async incrFailures(p) {
      const n = (failures.get(p) ?? 0) + 1;
      failures.set(p, n);
      return n;
    },
    async getFailures(p) {
      return failures.get(p) ?? 0;
    },
    async isOpen(p) {
      return openLive(p);
    },
    async markOpen(p, cooldownSec) {
      openUntil.set(p, clock.now + cooldownSec);
    },
    async reset(p) {
      failures.delete(p);
      openUntil.delete(p);
    },
  };
}

const OPTS = { failureThreshold: 3, cooldownSec: 30 };

describe("circuit-breaker", () => {
  it("closed : exécute fn et propage le résultat", async () => {
    const br = createCircuitBreaker(memKV({ now: 1000 }));
    const out = await br.run("circle", async () => "ok", OPTS);
    expect(out).toBe("ok");
    expect(await br.state("circle")).toBe("closed");
  });

  it("propage l'erreur de fn tant que le seuil n'est pas atteint", async () => {
    const br = createCircuitBreaker(memKV({ now: 1000 }));
    const boom = async () => {
      throw new Error("provider 500");
    };
    await expect(br.run("circle", boom, OPTS)).rejects.toThrow("provider 500");
    await expect(br.run("circle", boom, OPTS)).rejects.toThrow("provider 500");
    expect(await br.state("circle")).toBe("closed"); // 2 échecs < seuil 3
  });

  it("ouvre le circuit au seuil et refuse ensuite sans appeler fn", async () => {
    const br = createCircuitBreaker(memKV({ now: 1000 }));
    const boom = vi.fn(async () => {
      throw new Error("provider 500");
    });
    for (let i = 0; i < 3; i++) {
      await expect(br.run("circle", boom, OPTS)).rejects.toThrow("provider 500");
    }
    expect(await br.state("circle")).toBe("open");

    boom.mockClear();
    await expect(br.run("circle", boom, OPTS)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
    expect(boom).not.toHaveBeenCalled();
  });

  it("half-open après cooldown : un succès referme le circuit", async () => {
    const clock = { now: 1000 };
    const br = createCircuitBreaker(memKV(clock));
    const boom = async () => {
      throw new Error("down");
    };
    for (let i = 0; i < 3; i++) await br.run("circle", boom, OPTS).catch(() => {});
    expect(await br.state("circle")).toBe("open");

    // avance au-delà du cooldown → marqueur expiré, sonde half-open autorisée
    clock.now += OPTS.cooldownSec + 1;
    const probe = vi.fn(async () => "recovered");
    const out = await br.run("circle", probe, OPTS);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(out).toBe("recovered");
    expect(await br.state("circle")).toBe("closed");
  });

  it("half-open : un échec de sonde rouvre le circuit", async () => {
    const clock = { now: 1000 };
    const br = createCircuitBreaker(memKV(clock));
    const boom = async () => {
      throw new Error("down");
    };
    for (let i = 0; i < 3; i++) await br.run("circle", boom, OPTS).catch(() => {});

    // cooldown écoulé → sonde, mais elle échoue → réouverture pleine
    clock.now += OPTS.cooldownSec + 1;
    await expect(br.run("circle", boom, OPTS)).rejects.toThrow("down");
    expect(await br.state("circle")).toBe("open");

    // juste après, on est de nouveau refusé sans appeler fn
    const probe = vi.fn(async () => "x");
    await expect(br.run("circle", probe, OPTS)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
    expect(probe).not.toHaveBeenCalled();
  });

  it("un succès remet le compteur d'échecs à zéro", async () => {
    const kv = memKV({ now: 1000 });
    const br = createCircuitBreaker(kv);
    const boom = async () => {
      throw new Error("e");
    };
    await br.run("circle", boom, OPTS).catch(() => {});
    await br.run("circle", boom, OPTS).catch(() => {}); // 2 échecs
    await br.run("circle", async () => "ok", OPTS); // succès → reset
    expect(await kv.getFailures("circle")).toBe(0);
  });

  it("fail-soft : sans KV (null), exécute toujours fn", async () => {
    const br = createCircuitBreaker(null);
    expect(await br.run("circle", async () => "ok", OPTS)).toBe("ok");
    await expect(
      br.run("circle", async () => {
        throw new Error("nope");
      }, OPTS),
    ).rejects.toThrow("nope");
    expect(await br.state("circle")).toBe("closed");
  });
});
