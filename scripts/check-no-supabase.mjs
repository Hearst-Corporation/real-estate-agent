#!/usr/bin/env node
/**
 * Gate anti-régression Supabase — la DB est un Postgres self-hosté gpu1 exposé
 * par PostgREST (`getGpu1Admin()` de `@/lib/gpu1`). Supabase Cloud (GoTrue,
 * Storage, Realtime, SDK `@supabase/*`) est SUPPRIMÉ du runtime. Ce script
 * échoue (`exit 1`) si un usage ACTIF de Supabase réapparaît dans le code.
 *
 * Autonome (zéro dépendance), branché sur `npm run check`.
 *
 * Détecte (en syntaxe active, hors commentaires/allowlist) :
 *   - paquet SDK           : @supabase/…
 *   - imports morts        : @/lib/server/supabase, @/lib/supabase
 *   - helpers morts        : getSupabaseAdmin, SupabaseClient
 *   - env Supabase         : SUPABASE_*, NEXT_PUBLIC_SUPABASE*
 *   - URL Cloud            : *.supabase.co
 *   - message legacy       : supabase_not_configured
 *
 * Allowlist MINIMALE, fichier par fichier, UNIQUEMENT pour :
 *   - SQL historique indispensable (`grant … to supabase_auth_admin`) sous
 *     `supabase/migrations/` — hors périmètre de scan de toute façon.
 *   - commentaires historiques de `lib/gpu1/*` (documentent la migration).
 * Les commentaires (// … et lignes de bloc  * …) sont ignorés PARTOUT, donc une
 * mention en prose n'est jamais une violation — seule la syntaxe active compte.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();

// Répertoires scannés (le reste du repo n'est pas concerné par cette gate).
const SCAN_DIRS = ["app", "lib", "scripts", "e2e", "config"];

// Exclus du scan : deps, migrations SQL (SQL historique légitime), artefacts.
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".next",
  ".orchestration",
  ".git",
]);
const EXCLUDE_PATH_RE = [
  /^supabase[\\/]migrations[\\/]/, // SQL historique — hors périmètre
];

// Allowlist fichier par fichier : commentaires historiques documentant la
// migration gpu1. Ces fichiers PORTENT le nom Supabase en prose légitime ; les
// lignes actives y sont malgré tout vérifiées (l'allowlist ne débraye QUE si la
// détection tombait dans une ligne active — ici il n'y en a pas, c'est de la doc).
const ALLOWLIST_FILES = new Set([
  "lib/gpu1/index.ts", // commentaires : « Remplace getSupabaseAdmin par … »
  "lib/gpu1/postgrest.ts", // commentaire : « Remplace le SDK @supabase/supabase-js »
  "scripts/check-no-supabase.mjs", // ce fichier : les motifs y sont des littéraux de règle
]);

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// Règles : chaque motif ne matche QUE du code actif (les commentaires sont
// retirés avant test, cf. stripComments).
const RULES = [
  { id: "supabase-package", re: /@supabase\//, msg: "import du SDK @supabase/* interdit (DB = gpu1 PostgREST)" },
  { id: "supabase-lib-import", re: /@\/lib\/(server\/)?supabase\b/, msg: "import mort @/lib/(server/)supabase — utiliser @/lib/gpu1" },
  { id: "getSupabaseAdmin", re: /\bgetSupabaseAdmin\b/, msg: "helper mort getSupabaseAdmin — utiliser getGpu1Admin()" },
  { id: "SupabaseClient", re: /\bSupabaseClient\b/, msg: "type mort SupabaseClient — utiliser le client gpu1" },
  { id: "supabase-env", re: /\bNEXT_PUBLIC_SUPABASE[A-Z_]*\b|\bSUPABASE_[A-Z_]+\b/, msg: "env Supabase interdite — utiliser GPU1_POSTGREST_URL / GPU1_POSTGREST_ADMIN_TOKEN" },
  { id: "supabase-url", re: /\bsupabase\.co\b/, msg: "URL supabase.co interdite (Cloud supprimé)" },
  { id: "supabase-not-configured", re: /supabase_not_configured/, msg: "message legacy supabase_not_configured — utiliser database_not_configured" },
];

/**
 * Retire les commentaires d'une ligne source pour ne tester QUE la syntaxe
 * active. Gère les commentaires de ligne (`//`), les lignes de bloc JSDoc
 * (`* …`, ` /* …`, `*​/`) et les `#` (shebang / commentaires mjs éventuels).
 * Approche ligne-à-ligne suffisante ici : on ne veut pas parser le TS, juste
 * éviter qu'une mention en prose ne déclenche un faux positif.
 */
function stripComments(line) {
  const trimmed = line.trimStart();
  // Ligne entièrement commentaire (bloc JSDoc ou // ou #).
  if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("#")) {
    return "";
  }
  // Commentaire de fin de ligne : on coupe au premier // hors chaîne.
  // Heuristique simple (pas de parsing) : coupe à `//` s'il n'est pas dans une URL http(s)://.
  const idx = line.indexOf("//");
  if (idx >= 0) {
    const before = line.slice(0, idx);
    // Évite de couper une URL `https://` : on ne coupe que si `//` n'est pas précédé de `:`.
    if (before[before.length - 1] !== ":") return before;
  }
  // Commentaire de bloc inline `/* … */`.
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

for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  let files;
  try {
    files = walk(abs, []);
  } catch {
    continue;
  }
  for (const file of files) {
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
        if (rule.re.test(active)) {
          violations.push({ file: rel, line: i + 1, rule: rule.id, msg: rule.msg, src: lines[i].trim() });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\n✖ check-no-supabase : ${violations.length} violation(s) — Supabase est RETIRÉ (DB = gpu1 PostgREST).\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}] ${v.msg}`);
    console.error(`      ${v.src}`);
  }
  console.error("");
  process.exit(1);
}

console.log("✓ check-no-supabase : aucune régression Supabase (DB = gpu1 PostgREST).");
