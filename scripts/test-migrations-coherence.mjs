#!/usr/bin/env node
/**
 * test-migrations-coherence.mjs — HARNAIS STATIQUE (aucune connexion DB, jamais gpu1).
 *
 * Prouve la cohérence des migrations 0043_platform_augmented_002 et 0044_agent_gateway :
 *   1. IDEMPOTENCE  — toute création (table/index/policy/trigger) est gardée
 *      (IF NOT EXISTS, ou drop-if-exists avant create pour les triggers/policies).
 *   2. DISJONCTION  — les tables CRÉÉES par 0043 et 0044 sont disjointes.
 *   3. ORDRE        — 0043 (préfixe numérique) précède 0044.
 *   4. SANS DÉP. CROISÉE — 0043 ne référence aucune table exclusive de 0044, et
 *      réciproquement.
 *
 * Sortie : rapport lisible + exit 1 si une invariante casse.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG = join(__dirname, "..", "supabase", "migrations");

const FILES = {
  "0043": "0043_platform_augmented_002.sql",
  "0044": "0044_agent_gateway.sql",
};

let failures = 0;
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

const sql = {};
for (const [k, f] of Object.entries(FILES)) sql[k] = readFileSync(join(MIG, f), "utf8");

// Enlève les commentaires ligne (-- …) pour l'analyse (garde les chaînes simples).
const strip = (s) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

// Extrait les noms de tables créées (create table [if not exists] [public.]NAME).
function createdTables(s) {
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?/gi;
  const out = new Set();
  let m;
  while ((m = re.exec(s))) out.add(m[1].toLowerCase());
  return out;
}

// ─── 1. IDEMPOTENCE ──────────────────────────────────────────────────────────
console.log("\n[1] IDEMPOTENCE (toute création gardée)");
for (const [k, raw] of Object.entries(sql)) {
  const s = strip(raw);

  // create table → doit être IF NOT EXISTS
  const tblCreates = [...s.matchAll(/create\s+table\s+(if\s+not\s+exists\s+)?/gi)];
  const tblUnguarded = tblCreates.filter((m) => !m[1]).length;
  if (tblUnguarded > 0) fail(`${k}: ${tblUnguarded} 'create table' sans IF NOT EXISTS`);
  else ok(`${k}: ${tblCreates.length} 'create table' → tous IF NOT EXISTS`);

  // create index → doit être IF NOT EXISTS
  const idxCreates = [...s.matchAll(/create\s+(unique\s+)?index\s+(concurrently\s+)?(if\s+not\s+exists\s+)?/gi)];
  const idxUnguarded = idxCreates.filter((m) => !m[3]).length;
  if (idxUnguarded > 0) fail(`${k}: ${idxUnguarded} 'create index' sans IF NOT EXISTS`);
  else ok(`${k}: ${idxCreates.length} 'create index' → tous IF NOT EXISTS`);

  // alter table ... add column → doit être IF NOT EXISTS (0043 seulement)
  const addCols = [...s.matchAll(/add\s+column\s+(if\s+not\s+exists\s+)?/gi)];
  const addUnguarded = addCols.filter((m) => !m[1]).length;
  if (addCols.length > 0) {
    if (addUnguarded > 0) fail(`${k}: ${addUnguarded} 'add column' sans IF NOT EXISTS`);
    else ok(`${k}: ${addCols.length} 'add column' → tous IF NOT EXISTS`);
  }

  // create trigger → non idempotent nativement : exige un 'drop trigger if exists' du même nom.
  const trigCreates = [...s.matchAll(/create\s+trigger\s+([a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase());
  const trigDrops = new Set([...s.matchAll(/drop\s+trigger\s+if\s+exists\s+([a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase()));
  for (const t of trigCreates) {
    if (!trigDrops.has(t)) fail(`${k}: trigger '${t}' créé sans 'drop trigger if exists ${t}' préalable (2e passage → 42710)`);
    else ok(`${k}: trigger '${t}' gardé par drop-if-exists`);
  }

  // create policy → idem, exige un drop policy if exists (0043).
  const polCreates = [...s.matchAll(/create\s+policy\s+["']([^"']+)["']/gi)].map((m) => m[1]);
  const polDrops = new Set([...s.matchAll(/drop\s+policy\s+if\s+exists\s+["']([^"']+)["']/gi)].map((m) => m[1]));
  for (const p of polCreates) {
    if (!polDrops.has(p)) fail(`${k}: policy "${p}" créée sans 'drop policy if exists' (2e passage → 42710)`);
    else ok(`${k}: policy "${p}" gardée par drop-if-exists`);
  }
}

// ─── 2. DISJONCTION ──────────────────────────────────────────────────────────
console.log("\n[2] DISJONCTION (tables créées par 0043 vs 0044)");
const t43 = createdTables(strip(sql["0043"]));
const t44 = createdTables(strip(sql["0044"]));
const overlap = [...t43].filter((t) => t44.has(t));
console.log(`  0043 crée : ${[...t43].sort().join(", ") || "(aucune)"}`);
console.log(`  0044 crée : ${[...t44].sort().join(", ") || "(aucune)"}`);
if (overlap.length > 0) fail(`tables créées EN DOUBLE par 0043 et 0044 : ${overlap.join(", ")}`);
else ok("aucune table créée par les deux migrations (disjointes)");

// Vérifie les attendus explicites du brief.
const expect43 = ["rea_tasks"]; // 0043 crée rea_tasks (+ ALTER sur criteres/leads/estimations)
const expect44 = ["agent_gateway_idempotency_keys", "agent_gateway_audit_log"];
for (const e of expect43) (t43.has(e) ? ok(`0043 crée bien '${e}'`) : fail(`0043 devrait créer '${e}'`));
for (const e of expect44) (t44.has(e) ? ok(`0044 crée bien '${e}'`) : fail(`0044 devrait créer '${e}'`));

// ─── 3. ORDRE ────────────────────────────────────────────────────────────────
console.log("\n[3] ORDRE (préfixe numérique)");
const n43 = parseInt(FILES["0043"].slice(0, 4), 10);
const n44 = parseInt(FILES["0044"].slice(0, 4), 10);
if (n43 < n44) ok(`0043 (${n43}) s'applique avant 0044 (${n44})`);
else fail(`ordre incorrect : ${n43} devrait précéder ${n44}`);

// ─── 4. SANS DÉPENDANCE CROISÉE ──────────────────────────────────────────────
console.log("\n[4] SANS DÉPENDANCE CROISÉE");
// 0043 ne doit référencer AUCUNE table exclusive de 0044…
const ref43to44 = [...t44].filter((t) => new RegExp(`\\b${t}\\b`, "i").test(strip(sql["0043"])));
if (ref43to44.length > 0) fail(`0043 référence une table de 0044 : ${ref43to44.join(", ")}`);
else ok("0043 ne référence aucune table exclusive de 0044");
// …et 0044 ne doit référencer AUCUNE table créée par 0043 (rea_tasks).
const ref44to43 = [...t43].filter((t) => new RegExp(`\\b${t}\\b`, "i").test(strip(sql["0044"])));
if (ref44to43.length > 0) fail(`0044 référence une table créée par 0043 : ${ref44to43.join(", ")}`);
else ok("0044 ne référence aucune table exclusive de 0043");

// ─── Verdict ─────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
if (failures === 0) {
  console.log("✓ COHÉRENCE STATIQUE PROUVÉE — 0043 & 0044 idempotentes, disjointes, ordonnées, sans dépendance croisée.");
  process.exit(0);
} else {
  console.error(`✗ ${failures} invariante(s) cassée(s).`);
  process.exit(1);
}
