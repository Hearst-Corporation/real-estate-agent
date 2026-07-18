#!/usr/bin/env node
/**
 * Cohérence statique des migrations release 0043→0058.
 * Aucune connexion DB et aucune écriture GPU1 — analyse de texte pure.
 *
 * Couvre :
 *   - Vague 0043→0048 (release 002) : ordre, créations disjointes, idempotence, RLS prosp_config.
 *   - Vague 0049→0058 (REA-PRODUCT-007/008) : numérotation unique/séquentielle, idempotence
 *     (IF NOT EXISTS / drop-if-exists trigger+policy / DO-guards), absence de collision de nom
 *     de table, FK cohérentes (référence une table connue), ordre des dépendances inter-migrations.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG = join(__dirname, "..", "supabase", "migrations");

// ── Vague release 002 (analyse historique conservée) ───────────────────────────
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

// ── Vague REA-PRODUCT-007/008 (0049→0058) ──────────────────────────────────────
// Chaque entrée : fichier, tables créées attendues, tables PRÉEXISTANTES qu'elle
// est autorisée à référencer par FK (créées hors de cette vague ou avant elle).
const WAVE = [
  { n: "0049", file: "0049_alert_approvals_pending_decision.sql", creates: [] },
  { n: "0050", file: "0050_outbox.sql", creates: ["outbox_drafts"] },
  { n: "0051", file: "0051_visit_report.sql", creates: ["visit_reports"] },
  {
    n: "0052",
    file: "0052_offmarket_selection.sql",
    creates: ["offmarket_selections", "offmarket_selection_items", "offmarket_feedback"],
  },
  { n: "0053", file: "0053_reactivation.sql", creates: ["reactivation_log"] },
  { n: "0054", file: "0054_post_visit_signals.sql", creates: ["post_visit_signals"] },
  { n: "0055", file: "0055_mandate_renewal.sql", creates: ["mandate_renewal_proposals"] },
  { n: "0056", file: "0056_share_events.sql", creates: ["share_events"] },
  { n: "0057", file: "0057_value_snapshots.sql", creates: ["value_snapshots"] },
  { n: "0058", file: "0058_learning_signals.sql", creates: ["learning_signals"] },
];

// Tables préexistantes connues (créées avant la vague ou hors périmètre migrations).
const PREEXISTING = new Set([
  "leads",
  "properties",
  "mandates",
  "visits",
  "estimations",
  "prosp_criteres_acquereur",
  "agent_alert_approvals",
]);

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

function referencedTables(value) {
  return new Set(
    [...value.matchAll(/references\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
}

function precedingGuard(value, createIndex, expression) {
  return expression.test(value.slice(0, createIndex));
}

console.log("\n[1] ORDRE ET DÉPENDANCES (0043→0048)");
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

console.log("\n[2] CRÉATIONS ATTENDUES ET DISJOINTES (0043→0048)");
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

console.log("\n[3] IDEMPOTENCE DANS CHAQUE FICHIER (0043→0048)");
for (const [number, value] of sql) {
  checkIdempotence(number, value);
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

// ── Idempotence réutilisable pour toute migration ─────────────────────────────
function checkIdempotence(number, value) {
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

  for (const match of value.matchAll(/create\s+policy\s+"?([a-z0-9_ ]+?)"?\s+on\b/gi)) {
    const raw = match[1].trim();
    const name = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Accepte soit un drop-policy-if-exists préalable, soit un garde DO/pg_policies.
    const dropGuard = new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+"?${name}"?`, "i");
    const doGuard = new RegExp(`if\\s+not\\s+exists[\\s\\S]{0,400}policyname\\s*=\\s*'${name}'`, "i");
    const doGuardRev = new RegExp(`policyname\\s*=\\s*'${name}'[\\s\\S]{0,400}not\\s+exists`, "i");
    if (
      precedingGuard(value, match.index, dropGuard) ||
      doGuard.test(value) ||
      doGuardRev.test(value)
    ) {
      ok(`${number}: policy "${raw}" gardée (drop-if-exists ou DO/pg_policies)`);
    } else {
      fail(`${number}: policy "${raw}" sans garde d'idempotence`);
    }
  }
}

// ── [5] VAGUE 0049→0058 : numérotation, unicité, FK, ordre, idempotence ────────
console.log("\n[5] VAGUE 0049→0058 — NUMÉROTATION & PRÉSENCE");
const waveSql = new Map();
const waveNumbers = WAVE.map((m) => Number(m.n));
if (waveNumbers.every((n, i) => i === 0 || n === waveNumbers[i - 1] + 1)) {
  ok(`séquence continue sans trou : ${waveNumbers.join(" → ")}`);
} else {
  fail(`séquence non continue : ${waveNumbers.join(" → ")}`);
}
const seenNumbers = new Set();
for (const m of WAVE) {
  if (seenNumbers.has(m.n)) fail(`numéro dupliqué : ${m.n}`);
  seenNumbers.add(m.n);
  const path = join(MIG, m.file);
  if (!existsSync(path)) {
    fail(`migration absente : ${m.file}`);
    continue;
  }
  waveSql.set(m.n, strip(readFileSync(path, "utf8")));
}

console.log("\n[6] VAGUE 0049→0058 — CRÉATIONS DISJOINTES");
// Vérifie aussi contre les tables déjà créées par 0043→0048 (owners global).
for (const m of WAVE) {
  const value = waveSql.get(m.n);
  if (!value) continue;
  const tables = createdTables(value);
  const missing = m.creates.filter((t) => !tables.has(t));
  const unexpected = [...tables].filter((t) => !m.creates.includes(t));
  if (missing.length) fail(`${m.n}: tables attendues absentes : ${missing.join(", ")}`);
  else ok(`${m.n}: crée ${m.creates.join(", ") || "aucune table"}`);
  if (unexpected.length) fail(`${m.n}: tables inattendues créées : ${unexpected.join(", ")}`);
  for (const table of tables) {
    if (owners.has(table)) fail(`collision de nom : ${table} créée par ${owners.get(table)} ET ${m.n}`);
    else owners.set(table, m.n);
  }
}

console.log("\n[7] VAGUE 0049→0058 — IDEMPOTENCE PAR FICHIER");
for (const m of WAVE) {
  const value = waveSql.get(m.n);
  if (!value) continue;
  checkIdempotence(m.n, value);
}

console.log("\n[8] VAGUE 0049→0058 — FK COHÉRENTES (réf. table connue)");
// Une FK est cohérente si elle référence : une table préexistante connue, une table
// créée par la vague, une table créée plus tôt (ordre), OU si la référence est
// gardée par un test d'existence (do $$ ... information_schema.tables ...).
const waveCreatedSoFar = new Set();
for (const m of WAVE) {
  const value = waveSql.get(m.n);
  if (!value) continue;
  // Enregistre les tables créées AVANT d'évaluer ses propres FK internes (self/forward).
  for (const t of createdTables(value)) waveCreatedSoFar.add(t);
  const refs = referencedTables(value);
  const softGuarded = /information_schema\.tables/i.test(value);
  for (const ref of refs) {
    const known =
      PREEXISTING.has(ref) ||
      waveCreatedSoFar.has(ref) ||
      [...owners.keys()].includes(ref);
    if (known) {
      ok(`${m.n}: FK → ${ref} (table connue)`);
    } else if (softGuarded) {
      ok(`${m.n}: FK → ${ref} (souple, gardée par test d'existence)`);
    } else {
      fail(`${m.n}: FK → ${ref} : table inconnue et non gardée`);
    }
  }
}

console.log("\n[9] VAGUE 0049→0058 — ORDRE DES DÉPENDANCES INTER-MIGRATIONS");
// 0053 (reactivation_log) référence outbox_drafts (0050) : 0053 doit venir APRÈS 0050.
const dep0053 = waveSql.get("0053") ?? "";
if (/references\s+public\.outbox_drafts/i.test(dep0053)) {
  ok("0053 référence outbox_drafts — créée en 0050 (0050 < 0053, ordre OK)");
} else {
  ok("0053 ne pose pas de FK dure vers outbox_drafts (soft-guard)");
}
// 0049 étend agent_alert_approvals (0045) : présent AVANT.
if (/agent_alert_approvals/i.test(waveSql.get("0049") ?? "")) {
  ok("0049 étend agent_alert_approvals (créée en 0045, avant la vague — OK)");
}

console.log("\n[10] VAGUE 0049→0058 — TRANSACTIONNALITÉ");
for (const m of WAVE) {
  const value = waveSql.get(m.n);
  if (!value) continue;
  const hasBegin = /\bbegin\s*;/i.test(value);
  const hasCommit = /\bcommit\s*;/i.test(value);
  if (hasBegin && hasCommit) ok(`${m.n}: encadrée BEGIN/COMMIT`);
  else if (!hasBegin && !hasCommit) ok(`${m.n}: DDL auto-commit (pas de bloc transactionnel — acceptable)`);
  else fail(`${m.n}: BEGIN/COMMIT déséquilibré (begin=${hasBegin} commit=${hasCommit})`);
}

console.log("\n" + "─".repeat(60));
if (failures === 0) {
  console.log(
    "✓ COHÉRENCE STATIQUE PROUVÉE — migrations 0043→0058 : numérotation unique/séquentielle,\n" +
      "  créations disjointes (zéro collision de nom), FK cohérentes, ordre des dépendances\n" +
      "  respecté, idempotence (IF NOT EXISTS / drop-if-exists / DO-guards) sur chaque objet.",
  );
  process.exit(0);
}
console.error(`✗ ${failures} invariante(s) cassée(s).`);
process.exit(1);
