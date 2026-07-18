// lib/env-check.test.ts — Preuve du comportement de boot (fail-fast) sans DB.
//
// Vérifie que assertBootEnv() :
//   - throw un message CLAIR listant les NOMS de vars manquantes (jamais de valeur) ;
//   - passe quand le socle requis est présent ;
//   - refuse AUTH_DEV_BYPASS=true en production ;
//   - ne throw PAS pendant `next build` (NEXT_PHASE=phase-production-build).
//
// Migration GPU1/PostgREST : le socle DB requis est GPU1_POSTGREST_URL +
// GPU1_POSTGREST_ADMIN_TOKEN (aucune variable DB publique).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertBootEnv } from "./env-check";

// NODE_ENV est typé read-only par @types/node (contrainte de TYPE, pas runtime :
// process.env accepte l'écriture par index). On passe par un cast pour l'écrire
// dans les tests (restauré en afterEach).
function setNodeEnv(v: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (v === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = v;
}

const KEYS = [
  "GPU1_POSTGREST_URL",
  "GPU1_POSTGREST_ADMIN_TOKEN",
  "JWT_SECRET",
  "AUTH_DEV_BYPASS",
  "NODE_ENV",
  "NEXT_PHASE",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (k === "NODE_ENV") {
      setNodeEnv(saved[k]);
      continue;
    }
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setValidBaseline() {
  process.env.GPU1_POSTGREST_URL = "https://db.example.test/rest/v1";
  process.env.GPU1_POSTGREST_ADMIN_TOKEN = "x".repeat(40);
  process.env.JWT_SECRET = "y".repeat(32);
}

describe("assertBootEnv", () => {
  it("throw quand GPU1_POSTGREST_ADMIN_TOKEN et JWT_SECRET manquent, en listant les NOMS", () => {
    process.env.GPU1_POSTGREST_URL = "https://db.example.test/rest/v1";
    // ADMIN_TOKEN + JWT absents
    let err: Error | null = null;
    try {
      assertBootEnv();
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("GPU1_POSTGREST_ADMIN_TOKEN");
    expect(err!.message).toContain("JWT_SECRET");
    expect(err!.message).toContain("ne peut pas démarrer");
  });

  it("ne fuite JAMAIS de valeur de secret dans le message d'erreur", () => {
    // Token valide (≥20) mais dont la valeur ne doit jamais apparaître.
    process.env.GPU1_POSTGREST_URL = "https://db.example.test/rest/v1";
    process.env.GPU1_POSTGREST_ADMIN_TOKEN = "SUPER_SECRET_VALUE_123456789012345";
    // JWT_SECRET trop court (<16) → déclenche l'échec ; sa valeur ne doit pas fuiter.
    process.env.JWT_SECRET = "leak-me";
    let err: Error | null = null;
    try {
      assertBootEnv();
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(Error);
    // Le message cite le NOM en échec (JWT_SECRET) mais AUCUNE des valeurs.
    expect(err!.message).toContain("JWT_SECRET");
    expect(err!.message).not.toContain("leak-me");
    expect(err!.message).not.toContain("SUPER_SECRET_VALUE_123456789012345");
  });

  it("throw quand GPU1_POSTGREST_URL manque ou n'est pas une URL", () => {
    process.env.GPU1_POSTGREST_ADMIN_TOKEN = "x".repeat(40);
    process.env.JWT_SECRET = "y".repeat(32);
    // URL absente
    let err: Error | null = null;
    try {
      assertBootEnv();
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("GPU1_POSTGREST_URL");
  });

  it("passe (ne throw pas) quand le socle requis est présent", () => {
    setValidBaseline();
    expect(() => assertBootEnv()).not.toThrow();
  });

  it("throw si AUTH_DEV_BYPASS=true en production", () => {
    setValidBaseline();
    setNodeEnv("production");
    process.env.AUTH_DEV_BYPASS = "true";
    expect(() => assertBootEnv()).toThrow(/AUTH_DEV_BYPASS/);
  });

  it("tolère AUTH_DEV_BYPASS=true hors production (dev)", () => {
    setValidBaseline();
    setNodeEnv("development");
    process.env.AUTH_DEV_BYPASS = "true";
    expect(() => assertBootEnv()).not.toThrow();
  });

  it("ne throw PAS pendant `next build` même si une var manque (warn seulement)", () => {
    process.env.NEXT_PHASE = "phase-production-build";
    // Aucune var requise posée : en runtime ça throw, en build phase → toléré.
    expect(() => assertBootEnv()).not.toThrow();
  });
});
