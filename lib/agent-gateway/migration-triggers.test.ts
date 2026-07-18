/**
 * Garde déterministe : idempotence des triggers des migrations gateway/approbations
 * (REA-M04-02).
 *
 * Postgres n'accepte pas `create trigger IF NOT EXISTS`. Une migration appliquée
 * MANUELLEMENT (le flux du repo applique le SQL via psql, sans garde anti-rejeu)
 * doit donc faire précéder chaque `create trigger` d'un `drop trigger if exists`
 * sur la même relation, sinon un rejeu échoue sur « trigger already exists ».
 *
 * 0044 et 0043 respectent ce pattern ; 0045 (create trigger nu) ne le respectait
 * PAS → 0046 le réaligne. Ce test lit le SQL versionné et prouve que, POUR CHAQUE
 * `create trigger` d'une migration du domaine, un `drop trigger if exists` de même
 * nom+relation le précède quelque part dans le corpus des migrations appliquables.
 * Il aurait attrapé le défaut 0045 et empêche toute régression future.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

/** Migrations du domaine REA-M04-02 (gateway + approbations + réalignements). */
const DOMAIN_MIGRATIONS = [
  "0044_agent_gateway.sql",
  "0045_alert_approvals.sql",
  "0046_agent_alert_approvals_trigger_idempotent.sql",
];

function read(file: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
}

/** SQL de TOUTES les migrations (le drop peut vivre dans une migration voisine). */
function allMigrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => read(f))
    .join("\n");
}

/** Extrait les `create trigger <nom> ... on <relation>` (nom + relation). */
function createdTriggers(sql: string): Array<{ name: string; relation: string }> {
  const out: Array<{ name: string; relation: string }> = [];
  const re =
    /create\s+trigger\s+([a-z0-9_]+)\s+(?:before|after|instead\s+of)\b[\s\S]*?\bon\s+([a-z0-9_.]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    out.push({ name: m[1].toLowerCase(), relation: m[2].toLowerCase() });
  }
  return out;
}

function hasDropIfExists(corpus: string, name: string, relation: string): boolean {
  // `drop trigger if exists <name> on <relation>` (tolère espaces/casse).
  const re = new RegExp(
    `drop\\s+trigger\\s+if\\s+exists\\s+${name}\\s+on\\s+${relation.replace(".", "\\.")}\\b`,
    "i",
  );
  return re.test(corpus);
}

describe("migrations gateway/approbations — triggers rejouables (idempotence)", () => {
  const corpus = allMigrationsSql();

  for (const file of DOMAIN_MIGRATIONS) {
    it(`${file} : chaque create trigger est précédé d'un drop trigger if exists`, () => {
      const triggers = createdTriggers(read(file));
      for (const t of triggers) {
        expect(
          hasDropIfExists(corpus, t.name, t.relation),
          `create trigger ${t.name} on ${t.relation} (dans ${file}) sans drop trigger if exists correspondant — un rejeu de migration échouerait`,
        ).toBe(true);
      }
    });
  }

  it("0046 réaligne bien le trigger d'approbation en drop+create idempotent", () => {
    const sql = read("0046_agent_alert_approvals_trigger_idempotent.sql");
    expect(sql).toMatch(
      /drop\s+trigger\s+if\s+exists\s+trg_agent_alert_approval_updated_at\s+on\s+public\.agent_alert_approvals/i,
    );
    expect(sql).toMatch(
      /create\s+trigger\s+trg_agent_alert_approval_updated_at/i,
    );
  });

  it("0046 est purement additif : il ne DROP ni ne modifie aucune table/donnée", () => {
    const sql = read("0046_agent_alert_approvals_trigger_idempotent.sql").toLowerCase();
    // Seul un `drop trigger if exists` est autorisé (pas de drop table/column, pas
    // de delete/truncate/alter destructif) hors commentaires de rollback.
    const executable = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/drop\s+table/);
    expect(executable).not.toMatch(/drop\s+column/);
    expect(executable).not.toMatch(/\btruncate\b/);
    expect(executable).not.toMatch(/\bdelete\s+from\b/);
  });
});
