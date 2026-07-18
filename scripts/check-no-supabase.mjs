#!/usr/bin/env node
/**
 * Gate anti-régression Supabase — la DB est un Postgres self-hosté gpu1 exposé
 * par PostgREST (`getGpu1Admin()` de `@/lib/gpu1`). Aucun SDK, service ou projet
 * Supabase n'existe dans ce produit. Ce script échoue (`exit 1`) si un usage
 * ACTIF réapparaît.
 *
 * Autonome (zéro dépendance), branché sur `npm run check`.
 *
 * TROIS SURFACES couvertes :
 *
 *   1. CODE — sources .ts/.tsx/.js/.jsx/.mjs/.cjs de tout le repo applicatif
 *      (app, lib, components, config, scripts, e2e, test, electron, gate,
 *      instrumentation + fichiers racine), commentaires ignorés :
 *        - import du SDK       : @supabase/…, "supabase-js"
 *        - imports morts       : @/lib/server/supabase, @/lib/supabase
 *        - helpers/types morts : getSupabaseAdmin, createSupabaseClient,
 *                                SupabaseClient
 *        - env Supabase        : SUPABASE_*, NEXT_PUBLIC_SUPABASE*
 *        - URL Cloud           : *.supabase.co, *.supabase.in
 *        - message legacy      : supabase_not_configured
 *
 *   2. DÉPENDANCES — `package.json` (toutes sections de deps) et `pnpm-lock.yaml` :
 *      aucun paquet `@supabase/*` ni `supabase` ne doit être installé.
 *
 *   3. ENVIRONNEMENT — fichiers `.env*` présents (dont `.env.local` non commité)
 *      + workflows `.github/workflows/*.yml` : aucune variable `SUPABASE_*` /
 *      `NEXT_PUBLIC_SUPABASE*` déclarée. Les vars canoniques sont
 *      `GPU1_POSTGREST_URL` / `GPU1_POSTGREST_ADMIN_TOKEN`.
 *
 * HORS PÉRIMÈTRE (volontaire) : `supabase/migrations/` — SQL PostgreSQL
 * historique DÉJÀ APPLIQUÉ sur gpu1, jamais réécrit (le rôle
 * `supabase_auth_admin` de 0005 est un nom de rôle Postgres réel). Voir
 * `supabase/migrations/README.md`.
 *
 * Les commentaires (`// …`, `# …`, lignes de bloc ` * …`) sont retirés avant
 * test dans les sources : une mention en prose n'est jamais une violation,
 * seule la syntaxe active compte.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();

// ── Surface 1 : CODE ─────────────────────────────────────────────────────────

// Répertoires scannés : tout le code applicatif, pas seulement le back.
const SCAN_DIRS = ["app", "lib", "components", "config", "scripts", "e2e", "test", "electron", "gate"];

// Fichiers racine scannés individuellement (hors d'un SCAN_DIR).
const ROOT_FILES = [
  "proxy.ts",
  "instrumentation.ts",
  "instrumentation-client.ts",
  "next.config.ts",
  "playwright.config.ts",
  "vitest.config.ts",
  "eslint.config.mjs",
  "postcss.config.mjs",
];

const EXCLUDE_DIRS = new Set(["node_modules", ".next", ".orchestration", ".git", "dist-electron", "out"]);
const EXCLUDE_PATH_RE = [
  /^supabase[\\/]migrations[\\/]/, // SQL historique appliqué — cf. README de ce dossier
];

// Allowlist fichier par fichier. MINIMALE : un seul fichier, celui-ci, dont les
// motifs SONT les littéraux des règles. Aucune source produit n'y figure.
const ALLOWLIST_FILES = new Set([
  "scripts/check-no-supabase.mjs", // ce fichier : les motifs y sont des littéraux de règle
]);

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const RULES = [
  { id: "supabase-package", re: /@supabase\/|["']supabase-js["']/, msg: "import du SDK Supabase interdit (DB = gpu1 PostgREST)" },
  { id: "supabase-lib-import", re: /@\/lib\/(server\/)?supabase\b/, msg: "import mort @/lib/(server/)supabase — utiliser @/lib/gpu1" },
  { id: "getSupabaseAdmin", re: /\bgetSupabaseAdmin\b|\bcreateSupabaseClient\b/, msg: "helper mort — utiliser getGpu1Admin()" },
  { id: "SupabaseClient", re: /\bSupabaseClient\b/, msg: "type mort SupabaseClient — utiliser Gpu1Client" },
  { id: "supabase-env", re: /\bNEXT_PUBLIC_SUPABASE[A-Z_]*\b|\bSUPABASE_[A-Z_]+\b/, msg: "env Supabase interdite — utiliser GPU1_POSTGREST_URL / GPU1_POSTGREST_ADMIN_TOKEN" },
  { id: "supabase-url", re: /\bsupabase\.(co|in)\b/, msg: "URL Supabase Cloud interdite (Cloud supprimé)" },
  { id: "supabase-not-configured", re: /supabase_not_configured/, msg: "message legacy supabase_not_configured — utiliser database_not_configured" },
];

/**
 * Retire les commentaires d'une ligne source pour ne tester QUE la syntaxe
 * active. Gère `//`, les lignes de bloc JSDoc (`* …`, `/* …`) et `#`.
 * Approche ligne-à-ligne : on ne parse pas le TS, on évite juste qu'une mention
 * en prose déclenche un faux positif.
 */
function stripComments(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("#")) {
    return "";
  }
  const idx = line.indexOf("//");
  if (idx >= 0) {
    const before = line.slice(0, idx);
    // N'ampute pas une URL `https://` : on ne coupe que si `//` n'est pas précédé de `:`.
    if (before[before.length - 1] !== ":") return before;
  }
  return line.replace(/\/\*.*?\*\//g, "");
}

function isExcludedPath(rel) {
  const parts = rel.split(sep);
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;
  return EXCLUDE_PATH_RE.some((re) => re.test(rel));
}

function walk(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (EXCLUDE_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    const rel = relative(ROOT, full);
    if (isExcludedPath(rel)) continue;
    if (st.isDirectory()) {
      walk(full, acc);
    } else if (EXTENSIONS.has(name.slice(name.lastIndexOf(".")))) {
      acc.push(full);
    }
  }
  return acc;
}

const violations = [];
const add = (file, line, rule, msg, src) => violations.push({ file, line, rule, msg, src: String(src).trim().slice(0, 160) });

const sourceFiles = [];
for (const dir of SCAN_DIRS) walk(join(ROOT, dir), sourceFiles);
for (const name of ROOT_FILES) {
  const full = join(ROOT, name);
  if (existsSync(full)) sourceFiles.push(full);
}

for (const file of sourceFiles) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (ALLOWLIST_FILES.has(rel)) continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const active = stripComments(lines[i]);
    if (!active.trim()) continue;
    for (const rule of RULES) {
      if (rule.re.test(active)) add(rel, i + 1, rule.id, rule.msg, lines[i]);
    }
  }
}

// ── Surface 2 : DÉPENDANCES (package.json + lockfile) ────────────────────────

const DEP_SECTIONS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const PKG = join(ROOT, "package.json");
if (existsSync(PKG)) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(PKG, "utf8"));
  } catch {
    pkg = null;
  }
  if (pkg) {
    for (const section of DEP_SECTIONS) {
      for (const name of Object.keys(pkg[section] ?? {})) {
        if (/^@supabase\//.test(name) || name === "supabase" || name === "supabase-js") {
          add("package.json", 0, "supabase-dependency", `dépendance Supabase interdite dans "${section}" (DB = gpu1 PostgREST)`, `${name}: ${pkg[section][name]}`);
        }
      }
    }
  }
}

for (const lockName of ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]) {
  const lock = join(ROOT, lockName);
  if (!existsSync(lock)) continue;
  const lines = readFileSync(lock, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/@supabase\//.test(lines[i])) {
      add(lockName, i + 1, "supabase-lockfile", "paquet @supabase/* présent dans le lockfile — désinstaller", lines[i]);
    }
  }
}

// ── Surface 3 : ENVIRONNEMENT (.env* + workflows CI) ─────────────────────────

const ENV_VAR_RE = /^\s*(?:export\s+)?(NEXT_PUBLIC_SUPABASE[A-Z_]*|SUPABASE_[A-Z_]+)\s*[:=]/;

const envFiles = readdirSync(ROOT).filter((n) => n === ".env" || n.startsWith(".env."));
for (const name of envFiles) {
  const lines = readFileSync(join(ROOT, name), "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith("#")) continue;
    if (ENV_VAR_RE.test(lines[i])) {
      // Ne jamais imprimer la valeur : on ne cite que le nom de la variable.
      const varName = lines[i].trim().split(/[:=]/)[0].trim();
      add(name, i + 1, "supabase-env-file", "variable Supabase morte — utiliser GPU1_POSTGREST_URL / GPU1_POSTGREST_ADMIN_TOKEN", varName);
    }
  }
}

const WF_DIR = join(ROOT, ".github", "workflows");
if (existsSync(WF_DIR)) {
  for (const name of readdirSync(WF_DIR).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))) {
    const lines = readFileSync(join(WF_DIR, name), "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith("#")) continue;
      if (ENV_VAR_RE.test(lines[i]) || /@supabase\//.test(lines[i])) {
        add(`.github/workflows/${name}`, i + 1, "supabase-ci", "référence Supabase dans la CI — la DB est gpu1 PostgREST", lines[i].trim().split(/[:=]/)[0].trim());
      }
    }
  }
}

// ── Verdict ──────────────────────────────────────────────────────────────────

if (violations.length > 0) {
  console.error(`\n✖ check-no-supabase : ${violations.length} violation(s) — Supabase est RETIRÉ (DB = gpu1 PostgREST).\n`);
  for (const v of violations) {
    console.error(`  ${v.file}${v.line ? `:${v.line}` : ""}  [${v.rule}] ${v.msg}`);
    console.error(`      ${v.src}`);
  }
  console.error("");
  process.exit(1);
}

console.log(
  `✓ check-no-supabase : aucune régression Supabase (code ${sourceFiles.length} fichiers + dépendances + env/CI) — DB = gpu1 PostgREST.`,
);
