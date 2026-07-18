#!/usr/bin/env node
/**
 * Cohérence statique des migrations release 0043→0048.
 * Aucune connexion DB et aucune écriture GPU1.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG = join(__dirname, "..", "supabase", "migrations");
const FILES = [
  "0043_platform_augmented_002.sql",
  "0044_agent_gateway.sql",
  "0045_alert_approvals.sql",
  "0046_auth_credentials_tenant_index.sql",
  "0047_rls_prospection.sql",
  "0048_agent_alert_approvals_trigger_idempotent.sql",
];
const EXPECTED_TABLES = {
  "0043": ["rea_tasks"],
  "0044": ["agent_gateway_idempotency_keys", "agent_gateway_audit_log"],
  "0045": ["agent_alert_approvals"],
  "0046": [],
  "0047": [],
  "0048": [],
};

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  ✗ ${message}`);
};
const ok = (message) => console.log(`  ✓ ${message}`);
const strip = (value) =>
  value
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

const sql = new Map();
for (const file of FILES) {
  const path = join(MIG, file);
  if (!existsSync(path)) {
    fail(`migration absente : ${file}`);
    continue;
  }
  sql.set(file.slice(0, 4), strip(readFileSync(path, "utf8")));
}

function createdTables(value) {
  return new Set(
    [...value.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map(
      (match) => match[1].toLowerCase(),
    ),
  );
}

function precedingGuard(value, createIndex, expression) {
  return expression.test(value.slice(0, createIndex));
}

console.log("\n[1] ORDRE ET DÉPENDANCES");
const numbers = FILES.map((file) => Number(file.slice(0, 4)));
if (numbers.every((number, index) => index === 0 || number > numbers[index - 1])) {
  ok(`ordre strict : ${numbers.join(" → ")}`);
} else {
  fail(`ordre non strict : ${numbers.join(" → ")}`);
}
for (const prerequisite of ["0037_local_auth_credentials.sql", "0040_prospection_industrialization.sql"]) {
  if (existsSync(join(MIG, prerequisite))) ok(`prérequis présent : ${prerequisite}`);
  else fail(`prérequis absent : ${prerequisite}`);
}
if (/create\s+table\s+if\s+not\s+exists\s+public\.agent_alert_approvals/i.test(sql.get("0045") ?? "")) {
  ok("0045 crée agent_alert_approvals avant sa référence par 0048");
} else {
  fail("0045 doit créer agent_alert_approvals avant 0048");
}
if (/public\.agent_alert_approvals/i.test(sql.get("0048") ?? "")) ok("0048 référence explicitement la table 0045");
else fail("0048 devrait référencer agent_alert_approvals");

console.log("\n[2] CRÉATIONS ATTENDUES ET DISJOINTES");
const owners = new Map();
for (const [number, value] of sql) {
  const tables = createdTables(value);
  const expected = EXPECTED_TABLES[number] ?? [];
  const missing = expected.filter((table) => !tables.has(table));
  const unexpected = [...tables].filter((table) => !expected.includes(table));
  if (missing.length) fail(`${number}: tables attendues absentes : ${missing.join(", ")}`);
  else ok(`${number}: tables attendues présentes (${expected.join(", ") || "aucune"})`);
  if (unexpected.length) fail(`${number}: tables inattendues créées : ${unexpected.join(", ")}`);
  for (const table of tables) {
    if (owners.has(table)) fail(`${table} créée par ${owners.get(table)} et ${number}`);
    else owners.set(table, number);
  }
}

console.log("\n[3] IDEMPOTENCE DANS CHAQUE FICHIER");
for (const [number, value] of sql) {
  const unguardedTables = [...value.matchAll(/create\s+table\s+(?!if\s+not\s+exists)/gi)];
  if (unguardedTables.length) fail(`${number}: create table sans IF NOT EXISTS`);

  const unguardedIndexes = [
    ...value.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?!if\s+not\s+exists)/gi),
  ];
  if (unguardedIndexes.length) fail(`${number}: create index sans IF NOT EXISTS`);

  const unguardedColumns = [...value.matchAll(/add\s+column\s+(?!if\s+not\s+exists)/gi)];
  if (unguardedColumns.length) fail(`${number}: add column sans IF NOT EXISTS`);

  for (const match of value.matchAll(/create\s+trigger\s+([a-z_][a-z0-9_]*)[\s\S]*?\bon\s+([a-z0-9_.]+)/gi)) {
    const name = match[1];
    const relation = match[2].replace(".", "\\.");
    const guard = new RegExp(`drop\\s+trigger\\s+if\\s+exists\\s+${name}\\s+on\\s+${relation}\\b`, "i");
    if (precedingGuard(value, match.index, guard)) ok(`${number}: trigger ${name} gardé avant création`);
    else fail(`${number}: trigger ${name} sans drop-if-exists préalable dans le même fichier`);
  }

  for (const match of value.matchAll(/create\s+policy\s+"([^"]+)"/gi)) {
    const name = match[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const guard = new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+"${name}"`, "i");
    if (!precedingGuard(value, match.index, guard)) {
      fail(`${number}: policy "${match[1]}" sans drop-if-exists préalable`);
    }
  }
}

console.log("\n[4] PRIVILÈGES RLS PROSP_CONFIG");
const rls = sql.get("0047") ?? "";
const configPolicies = [
  ...rls.matchAll(/create\s+policy\s+"[^"]+"\s+on\s+public\.prosp_config\b[\s\S]*?;/gi),
].map((match) => match[0]);
const configSql = configPolicies.join("\n");
if (configPolicies.length === 3) ok("prosp_config : trois policies explicites");
else fail(`prosp_config : 3 policies attendues, ${configPolicies.length} trouvée(s)`);
for (const operation of ["select", "insert", "update"]) {
  if (new RegExp(`for\\s+${operation}\\b`, "i").test(configSql)) ok(`prosp_config autorise ${operation.toUpperCase()}`);
  else fail(`prosp_config doit autoriser ${operation.toUpperCase()}`);
}
if (/for\s+(?:all|delete)\b/i.test(configSql)) fail("prosp_config ne doit autoriser ni ALL ni DELETE");
else ok("prosp_config refuse DELETE et n'utilise pas FOR ALL");

console.log("\n" + "─".repeat(60));
if (failures === 0) {
  console.log("✓ COHÉRENCE STATIQUE PROUVÉE — migrations 0043→0048 ordonnées, rejouables et sans élargissement DELETE.");
  process.exit(0);
}
console.error(`✗ ${failures} invariante(s) cassée(s).`);
process.exit(1);
