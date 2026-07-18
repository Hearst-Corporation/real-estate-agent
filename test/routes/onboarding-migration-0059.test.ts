/**
 * Invariants statiques de la migration 0059_product_tour_progress.sql.
 *
 * `scripts/test-migrations-coherence.mjs` a ses vagues codées en dur et s'arrête
 * à 0058 : il ne prouve RIEN sur 0059. Ce test comble le trou en rejouant les
 * mêmes invariants (idempotence, RLS, transactionnalité) sur le nouveau fichier,
 * et vérifie l'alignement code ↔ SQL (enum de statut, format de tour_key).
 *
 * Analyse de texte pure — aucune connexion DB, aucune écriture GPU1.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  TOUR_PROGRESS_STATUSES,
  TOUR_KEY_RE,
  TOUR_STEP_MAX,
  TOUR_VERSION_MAX,
} from "@/lib/onboarding/progress-db";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const FILE = "0059_product_tour_progress.sql";
const raw = readFileSync(join(MIG_DIR, FILE), "utf8");
/** SQL sans les commentaires `--` (les invariants ne portent que sur le code actif). */
const sql = raw
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("0059 — numérotation", () => {
  it("est la dernière migration et suit 0058 sans trou", () => {
    const numbers = readdirSync(MIG_DIR)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => Number(f.slice(0, 4)))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    expect(Math.max(...numbers)).toBe(59);
    expect(numbers).toContain(58);
    // Aucun doublon de numéro 0059.
    expect(numbers.filter((n) => n === 59)).toHaveLength(1);
  });
});

describe("0059 — idempotence (mêmes règles que le script de cohérence)", () => {
  it("aucun CREATE TABLE sans IF NOT EXISTS", () => {
    expect([...sql.matchAll(/create\s+table\s+(?!if\s+not\s+exists)/gi)]).toHaveLength(0);
  });

  it("aucun CREATE INDEX sans IF NOT EXISTS", () => {
    expect(
      [...sql.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?!if\s+not\s+exists)/gi)],
    ).toHaveLength(0);
  });

  it("chaque trigger est précédé d'un DROP TRIGGER IF EXISTS sur la même relation", () => {
    const triggers = [
      ...sql.matchAll(/create\s+trigger\s+([a-z_][a-z0-9_]*)[\s\S]*?\bon\s+([a-z0-9_.]+)/gi),
    ];
    expect(triggers.length).toBeGreaterThan(0);
    for (const m of triggers) {
      const guard = new RegExp(
        `drop\\s+trigger\\s+if\\s+exists\\s+${m[1]}\\s+on\\s+${m[2].replace(".", "\\.")}\\b`,
        "i",
      );
      expect(guard.test(sql.slice(0, m.index))).toBe(true);
    }
  });

  it("chaque policy est précédée d'un DROP POLICY IF EXISTS", () => {
    const policies = [...sql.matchAll(/create\s+policy\s+"([^"]+)"\s+on\b/gi)];
    expect(policies.length).toBeGreaterThan(0);
    for (const m of policies) {
      const guard = new RegExp(
        `drop\\s+policy\\s+if\\s+exists\\s+"${m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
        "i",
      );
      expect(guard.test(sql.slice(0, m.index))).toBe(true);
    }
  });

  it("les fonctions sont en CREATE OR REPLACE", () => {
    const fns = [...sql.matchAll(/create\s+(or\s+replace\s+)?function/gi)];
    expect(fns.length).toBeGreaterThan(0);
    for (const m of fns) expect(m[1]).toBeTruthy();
  });

  it("est encadrée BEGIN/COMMIT", () => {
    expect(/\bbegin\s*;/i.test(sql)).toBe(true);
    expect(/\bcommit\s*;/i.test(sql)).toBe(true);
  });
});

describe("0059 — additive et non destructive", () => {
  it("ne crée QUE user_product_tour_progress", () => {
    const created = [
      ...sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi),
    ].map((m) => m[1]);
    expect(created).toEqual(["user_product_tour_progress"]);
  });

  it("ne contient aucun DROP/ALTER destructif sur une table existante", () => {
    // Seuls DROP autorisés : les gardes d'idempotence sur SES propres objets.
    expect(/drop\s+table/i.test(sql)).toBe(false);
    expect(/drop\s+column/i.test(sql)).toBe(false);
    expect(/truncate/i.test(sql)).toBe(false);
    const alters = [...sql.matchAll(/alter\s+table\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]);
    for (const t of alters) expect(t).toBe("user_product_tour_progress");
  });
});

describe("0059 — contrainte unique et politique d'index", () => {
  it("porte la contrainte UNIQUE (tenant_id, user_id, tour_key, tour_version)", () => {
    expect(
      /unique\s*\(\s*tenant_id\s*,\s*user_id\s*,\s*tour_key\s*,\s*tour_version\s*\)/i.test(sql),
    ).toBe(true);
  });

  it("ne pose AUCUN index supplémentaire (l'index de la contrainte couvre tout)", () => {
    expect([...sql.matchAll(/create\s+(?:unique\s+)?index/gi)]).toHaveLength(0);
  });
});

describe("0059 — RLS deny-by-default et owner-scope", () => {
  it("active la RLS sur la table", () => {
    expect(/alter\s+table\s+public\.user_product_tour_progress\s+enable\s+row\s+level\s+security/i.test(sql)).toBe(true);
  });

  it("la policy isole par tenant ET par user, réservée à authenticated", () => {
    expect(/for\s+all\s+to\s+authenticated/i.test(sql)).toBe(true);
    expect(/current_tenant_id\(\)/i.test(sql)).toBe(true);
    expect(/auth\.uid\(\)\s*\)?\s*=\s*user_id/i.test(sql)).toBe(true);
    // USING ET WITH CHECK : la lecture comme l'écriture sont bornées.
    expect(/using/i.test(sql)).toBe(true);
    expect(/with\s+check/i.test(sql)).toBe(true);
  });

  it("n'accorde aucun privilège à anon", () => {
    expect(/to\s+anon\b/i.test(sql)).toBe(false);
  });
});

describe("0059 — alignement SQL ↔ code TypeScript", () => {
  it("le CHECK status liste exactement TOUR_PROGRESS_STATUSES", () => {
    const m = sql.match(/status\s+text[\s\S]*?check\s*\(\s*status\s+in\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    const inSql = (m as RegExpMatchArray)[1]
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .sort();
    expect(inSql).toEqual([...TOUR_PROGRESS_STATUSES].sort());
  });

  it("le CHECK tour_key est le miroir de TOUR_KEY_RE", () => {
    const m = sql.match(/tour_key\s*~\s*'([^']+)'/i);
    expect(m).not.toBeNull();
    expect((m as RegExpMatchArray)[1]).toBe(TOUR_KEY_RE.source);
  });

  it("les bornes numériques du SQL correspondent aux constantes du code", () => {
    expect(new RegExp(`current_step\\s*<=\\s*${TOUR_STEP_MAX}`, "i").test(sql)).toBe(true);
    expect(new RegExp(`tour_version\\s*<=\\s*${TOUR_VERSION_MAX}`, "i").test(sql)).toBe(true);
  });

  it("aucune colonne de texte libre (barrière anti-PII)", () => {
    const textCols = [...sql.matchAll(/^\s{2}([a-z_]+)\s+text\b/gim)].map((m) => m[1]);
    // Seuls champs texte admis : l'id de tenant et la clé de tour (slug contraint).
    expect(textCols.sort()).toEqual(["status", "tenant_id", "tour_key"]);
  });
});

describe("0059 — n'est PAS marquée comme appliquée sur GPU1", () => {
  it("le fichier documente explicitement qu'elle n'est pas appliquée", () => {
    expect(/NON APPLIQU[ÉE]E SUR GPU1/i.test(raw)).toBe(true);
  });
});
