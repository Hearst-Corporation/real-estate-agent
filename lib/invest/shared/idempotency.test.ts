/**
 * lib/invest/shared/idempotency.test.ts — Pattern A (I8) via store mock.
 * Couvre : hashBody pur/stable, exécution neuve, rejeu, conflit.
 */

import { describe, it, expect, vi } from "vitest";
import {
  withIdempotency,
  hashBody,
  type IdempotencyStore,
  type IdempotencyRecord,
} from "./idempotency";
import { IdempotencyConflictError } from "./errors";

describe("hashBody", () => {
  it("est déterministe", () => {
    expect(hashBody({ a: 1, b: 2 })).toBe(hashBody({ a: 1, b: 2 }));
  });
  it("est insensible à l'ordre des clés (JSON canonique)", () => {
    expect(hashBody({ a: 1, b: 2 })).toBe(hashBody({ b: 2, a: 1 }));
  });
  it("change si le corps change", () => {
    expect(hashBody({ a: 1 })).not.toBe(hashBody({ a: 2 }));
  });
  it("produit un sha256 hex (64 chars)", () => {
    expect(hashBody({ x: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

/** Store mock en mémoire respectant ON CONFLICT DO NOTHING. */
function memStore(): IdempotencyStore & { rows: Map<string, IdempotencyRecord> } {
  const rows = new Map<string, IdempotencyRecord>();
  return {
    rows,
    async find(key) {
      return rows.get(key) ?? null;
    },
    async insert(key, bodyHash, response) {
      const existing = rows.get(key);
      if (existing) {
        // ON CONFLICT DO NOTHING : si la clé existe mais sans réponse (marqueur)
        // et qu'on apporte la réponse, le code appelle insert(key,..,result)
        // seulement sur le chemin "neuf" — où la ligne marqueur est la nôtre.
        if (existing.response == null && response != null) {
          rows.set(key, { idem_key: key, body_hash: bodyHash, response });
        }
        return false;
      }
      rows.set(key, { idem_key: key, body_hash: bodyHash, response });
      return true;
    },
  };
}

describe("withIdempotency", () => {
  it("exécute fn sur une clé neuve et mémorise la réponse", async () => {
    const store = memStore();
    const fn = vi.fn(async () => ({ minted: true }));
    const out = await withIdempotency(store, { key: "mint:1", bodyHash: "h1" }, fn);
    expect(out.replayed).toBe(false);
    expect(out.result).toEqual({ minted: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.rows.get("mint:1")?.response).toEqual({ minted: true });
  });

  it("rejoue la réponse mémorisée sans ré-exécuter fn (même bodyHash)", async () => {
    const store = memStore();
    const fn1 = vi.fn(async () => ({ minted: true }));
    await withIdempotency(store, { key: "mint:1", bodyHash: "h1" }, fn1);

    const fn2 = vi.fn(async () => ({ minted: "SHOULD_NOT_RUN" }));
    const out = await withIdempotency(store, { key: "mint:1", bodyHash: "h1" }, fn2);
    expect(out.replayed).toBe(true);
    expect(out.result).toEqual({ minted: true });
    expect(fn2).not.toHaveBeenCalled();
  });

  it("lève IdempotencyConflictError si même clé mais bodyHash différent", async () => {
    const store = memStore();
    await withIdempotency(store, { key: "mint:1", bodyHash: "h1" }, async () => ({ ok: 1 }));
    await expect(
      withIdempotency(store, { key: "mint:1", bodyHash: "DIFFERENT" }, async () => ({ ok: 2 })),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });
});
