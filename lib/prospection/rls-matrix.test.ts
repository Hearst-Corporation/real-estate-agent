// rls-matrix.test.ts — HARNAIS STATIQUE (aucune connexion DB, jamais gpu1).
//
// Prouve la MATRICE D'ACCÈS RLS du module Prospection posée par
// supabase/migrations/0047_rls_prospection.sql, PAR ANALYSE DU SQL VERSIONNÉ
// (le test réel contre Postgres se fait à l'intégration/QA — cf. mission REA-M04-03,
// condition STOP : aucune exécution sur gpu1).
//
// Invariants garantis (une fois la migration appliquée) :
//   • anon                        → refusé (aucune policy ne cible anon ; toutes
//                                   les policies prospection sont `to authenticated`).
//   • authenticated, même tenant  → autorisé (prédicat tenant_id = current_tenant_id()).
//   • authenticated, cross-tenant → refusé (le même prédicat exclut tout autre tenant).
//   • tables owner-scopées        → en plus, user_id = auth.uid().
//   • service-role                → bypass RLS (rôle serveur, non testé ici — owner-check
//                                   applicatif documenté dans la migration).
//   • Idempotence                 → chaque `create policy` est précédé d'un
//                                   `drop policy if exists` du même nom ; RLS activée
//                                   sur chaque table (re-jouable).
//   • Fermeture du trou 0040      → les 4 tables créées sans RLS par
//                                   0040_prospection_industrialization sont couvertes.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = join(__dirname, "..", "..", "supabase", "migrations");
const RLS_FILE = join(MIG_DIR, "0047_rls_prospection.sql");

// Enlève les commentaires ligne (-- …) pour n'analyser que le SQL exécuté.
const strip = (s: string): string =>
  s
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

const RAW = readFileSync(RLS_FILE, "utf8");
const SQL = strip(RAW);

// ── Toutes les tables prospection (nom réel en DB) ────────────────────────────
// Tables owner-scopées (portent user_id NOT NULL → prédicat user_id = auth.uid()).
const OWNER_SCOPED = [
  "prosp_prospects",
  "prosp_criteres_acquereur",
  "prosp_matchs",
  "prosp_match_feedback",
] as const;

// Tables tenant-scopées seules (pas de user_id, ou user_id nullable système).
const TENANT_SCOPED = [
  "prosp_annonce_versions",
  "prosp_optout",
  "prosp_idempotency_keys",
  "prosp_annonces",
  "prosp_config",
  "prosp_ingestion_runs",
] as const;

// prosp_contact_attempts : tenant + user_id NULLABLE → traitée à part (predicat mixte).
const CONTACT_ATTEMPTS = "prosp_contact_attempts";

// Tables créées SANS RLS par 0040 → le trou que 0047 doit fermer.
const TABLES_0040_UNPROTECTED = [
  "prosp_annonce_versions",
  "prosp_optout",
  "prosp_contact_attempts",
  "prosp_idempotency_keys",
] as const;

const ALL_TABLES = [...OWNER_SCOPED, ...TENANT_SCOPED, CONTACT_ATTEMPTS];

// ── Helpers d'extraction ──────────────────────────────────────────────────────

/** Bloc `create policy "…" on public.<table> … ;` (jusqu'au point-virgule). */
function policyBlock(table: string): string | null {
  const re = new RegExp(
    `create\\s+policy\\s+"[^"]+"\\s+on\\s+public\\.${table}\\b[\\s\\S]*?;`,
    "i",
  );
  const m = SQL.match(re);
  return m ? m[0] : null;
}

/** Nom(s) de policy créés sur une table. */
function policyNames(table: string): string[] {
  const re = new RegExp(
    `create\\s+policy\\s+"([^"]+)"\\s+on\\s+public\\.${table}\\b`,
    "gi",
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(SQL))) out.push(m[1]);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("0047 RLS prospection — RLS activée sur chaque table", () => {
  it.each(ALL_TABLES)("enable row level security sur %s", (table) => {
    const re = new RegExp(
      `alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
      "i",
    );
    expect(SQL).toMatch(re);
  });
});

describe("0047 RLS prospection — chaque table a AU MOINS une policy", () => {
  it.each(ALL_TABLES)("policy créée sur %s", (table) => {
    expect(policyNames(table).length).toBeGreaterThanOrEqual(1);
  });
});

describe("ANON DENIED — aucune policy ne cible anon (toutes `to authenticated`)", () => {
  it("aucune occurrence de `to anon` dans la migration", () => {
    expect(SQL).not.toMatch(/\bto\s+anon\b/i);
    expect(SQL).not.toMatch(/\bto\s+public\b/i);
  });

  it.each(ALL_TABLES)("la/les policy de %s est/sont `to authenticated`", (table) => {
    const block = policyBlock(table);
    expect(block, `bloc policy manquant pour ${table}`).toBeTruthy();
    // Toute policy prospection doit restreindre le rôle à authenticated.
    expect(block as string).toMatch(/\bto\s+authenticated\b/i);
  });
});

describe("CROSS-TENANT DENIED — chaque policy compare tenant_id à current_tenant_id()", () => {
  it.each(ALL_TABLES)("%s scope au tenant via current_tenant_id()", (table) => {
    const block = policyBlock(table);
    expect(block, `bloc policy manquant pour ${table}`).toBeTruthy();
    // Le prédicat DOIT contenir : tenant_id = (select public.current_tenant_id())
    expect(block as string).toMatch(
      /tenant_id\s*=\s*\(\s*select\s+public\.current_tenant_id\(\)\s*\)/i,
    );
    // Anti-régression : jamais la GUC app.tenant_id (jamais posée au runtime).
    expect(block as string).not.toMatch(/current_setting\(\s*'app\.tenant_id'/i);
  });
});

describe("OWNER-CHECK — tables owner-scopées exigent user_id = auth.uid()", () => {
  it.each(OWNER_SCOPED)("%s vérifie user_id = auth.uid()", (table) => {
    const block = policyBlock(table);
    expect(block, `bloc policy manquant pour ${table}`).toBeTruthy();
    expect(block as string).toMatch(
      /\(\s*select\s+auth\.uid\(\)\s*\)\s*=\s*user_id/i,
    );
  });

  it("prosp_contact_attempts scope tenant + owner-check nullable (user_id null OR = auth.uid())", () => {
    const block = policyBlock(CONTACT_ATTEMPTS);
    expect(block).toBeTruthy();
    expect(block as string).toMatch(/user_id\s+is\s+null\s+or\s+user_id\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)/i);
  });
});

describe("WITH CHECK — les policies `for all` ont un with check (pas d'écriture cross-tenant)", () => {
  // Tables `for all` = doivent border l'écriture (with check), pas seulement la lecture.
  const FOR_ALL = [...OWNER_SCOPED, "prosp_annonce_versions", "prosp_optout", "prosp_idempotency_keys", "prosp_config", CONTACT_ATTEMPTS];
  it.each(FOR_ALL)("%s : policy `for all` bordée par with check", (table) => {
    const block = policyBlock(table);
    expect(block, `bloc policy manquant pour ${table}`).toBeTruthy();
    if (/for\s+all\b/i.test(block as string)) {
      expect(block as string).toMatch(/with\s+check\s*\(/i);
    }
  });
});

describe("IDEMPOTENCE — chaque create policy est précédé d'un drop policy if exists", () => {
  it("toute policy créée a un drop-if-exists du même nom (re-jouable)", () => {
    const created = [...SQL.matchAll(/create\s+policy\s+"([^"]+)"/gi)].map((m) => m[1]);
    const dropped = new Set(
      [...SQL.matchAll(/drop\s+policy\s+if\s+exists\s+"([^"]+)"/gi)].map((m) => m[1]),
    );
    const missing = created.filter((p) => !dropped.has(p));
    expect(missing, `policies sans drop-if-exists → 2e passage = 42710 : ${missing.join(", ")}`).toEqual([]);
  });

  it("les anciennes policies (owner_all / tenant_select/insert/update) sont explicitement droppées", () => {
    // Ré-alignement : on retire les policies d'origine avant de recréer.
    expect(SQL).toMatch(/drop\s+policy\s+if\s+exists\s+"owner_all"/i);
    expect(SQL).toMatch(/drop\s+policy\s+if\s+exists\s+"tenant_select"/i);
    expect(SQL).toMatch(/drop\s+policy\s+if\s+exists\s+"tenant_insert"/i);
    expect(SQL).toMatch(/drop\s+policy\s+if\s+exists\s+"tenant_update"/i);
  });
});

describe("FERMETURE DU TROU 0040 — les 4 tables sans RLS sont couvertes", () => {
  it.each(TABLES_0040_UNPROTECTED)("%s : RLS activée + policy tenant-scopée", (table) => {
    expect(SQL).toMatch(
      new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"),
    );
    const block = policyBlock(table);
    expect(block, `${table} (créée sans RLS par 0040) doit recevoir une policy en 0047`).toBeTruthy();
    expect(block as string).toMatch(
      /tenant_id\s*=\s*\(\s*select\s+public\.current_tenant_id\(\)\s*\)/i,
    );
  });
});

describe("NON DESTRUCTIF — la migration ne DROP ni ne modifie aucune table", () => {
  it("aucun drop/truncate/alter-column/rename de table", () => {
    expect(SQL).not.toMatch(/drop\s+table\b/i);
    expect(SQL).not.toMatch(/truncate\b/i);
    expect(SQL).not.toMatch(/alter\s+table\s+\S+\s+(drop|rename|alter)\s+column/i);
    expect(SQL).not.toMatch(/alter\s+table\s+\S+\s+rename\s+to/i);
  });

  it("les seuls `alter table` sont des `enable row level security`", () => {
    const alters = [...SQL.matchAll(/alter\s+table\s+public\.\w+\s+([\s\S]*?);/gi)].map((m) =>
      m[1].trim().toLowerCase(),
    );
    for (const a of alters) {
      expect(a, `alter table inattendu : "${a}"`).toMatch(/^enable\s+row\s+level\s+security$/);
    }
  });
});

describe("SANS PII / SANS SECRET dans le SQL versionné", () => {
  it("aucun email/téléphone/token en clair", () => {
    // Pas d'adresse email littérale, pas de clé sk-/ghp_/service-role.
    expect(RAW).not.toMatch(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i);
    expect(RAW).not.toMatch(/\b(sk-|ghp_|eyJ[A-Za-z0-9])/);
  });
});
