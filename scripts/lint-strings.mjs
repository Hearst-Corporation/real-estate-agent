#!/usr/bin/env node
// @enable-adrien:layer=front-cockpit v=1
/**
 * LINT STRINGS — garde-fou anti-texte-UI-en-dur.
 * =================================================================
 *
 * Linter Node STANDALONE, ZÉRO dépendance. L'AGENTS.md proclame « zéro texte UI
 * en dur — tout passe par lib/ui-strings (UI.*) » mais AUCUN linter ne l'appliquait.
 * Ce fichier comble le trou, de façon CONSERVATRICE (faible faux-positif) :
 *
 *   On ne flague QUE :
 *     (1) le texte JSX entre balises  >Texte affiché<
 *     (2) les littéraux de props d'AFFICHAGE
 *         (placeholder|title|label|aria-label|alt|cta|emptyLabel|confirmMessage)
 *   ET seulement si le chunk « ressemble à du texte humain » (espace ou accent,
 *   ≥3 lettres, pas un chemin/URL/classe/constante technique).
 *
 * BASELINE GELÉE (cliquet décroissant) : les violations LEGACY sont figées dans
 * gate/strings-baseline.json (créé par `--reseed`). En CI, SEULES les NOUVELLES
 * (hors baseline) échouent → pas de mur rouge sur l'existant, mais aucune
 * régression nouvelle. Une string corrigée disparaît de la base au prochain reseed.
 *
 * Échappatoire ponctuelle : `strings-lint-allow` en commentaire de la ligne.
 *
 * Usage :
 *   node scripts/lint-strings.mjs            (CI : échoue sur NOUVELLE violation)
 *   node scripts/lint-strings.mjs --reseed   (regèle la baseline sur l'état courant)
 */

import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** Racines scannées (surface UI uniquement). */
const SCAN_DIRS = [join("app", "(dashboard)"), "components"];

/** Sous-arbres / fichiers exclus. */
const EXCLUDE = [join("components", "brochure")];

/** On ne lint que le JSX (là où vit le texte affiché). */
const EXTS = new Set([".tsx"]);

const ALLOW_MARK = "strings-lint-allow";
const BASELINE = join(ROOT, "gate", "strings-baseline.json");

/** Props dont la VALEUR littérale est du texte affiché. */
const DISPLAY_PROP_RE =
  /\b(?:placeholder|title|label|aria-label|alt|cta|emptyLabel|confirmMessage)\s*=\s*["']([^"']+)["']/g;
/** Texte JSX brut entre balises. */
const JSX_TEXT_RE = />([^<>{}]+)</g;

const ACCENT_RE = /[àâäéèêëïîôöùûüçœÀÂÄÉÈÊËÏÎÔÖÙÛÜÇŒ]/;
const TECH_RE = /[/{}@]|:\/\/|^--|^ct-|^\$|^#/; // chemins, URLs, classes ct-, vars

/** Vrai si le chunk ressemble à du TEXTE HUMAIN affichable. */
function looksLikeUiText(raw) {
  const s = raw.trim();
  if (s.length < 3) return false;
  if (TECH_RE.test(s)) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(s)) return false; // pas de lettre → pas du texte
  if (/^[A-Z0-9_]+$/.test(s)) return false; // CONSTANTE_TECHNIQUE
  const multiWord = /\s/.test(s);
  return multiWord || ACCENT_RE.test(s); // au moins un espace OU un accent
}

function extractChunks(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return [];
  const chunks = [];
  let m;
  DISPLAY_PROP_RE.lastIndex = 0;
  while ((m = DISPLAY_PROP_RE.exec(line)) !== null) chunks.push(m[1]);
  JSX_TEXT_RE.lastIndex = 0;
  while ((m = JSX_TEXT_RE.exec(line)) !== null) chunks.push(m[1]);
  return chunks;
}

function isExcluded(full) {
  return EXCLUDE.some((d) => full.includes(join(ROOT, d)));
}

function walk(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (isExcluded(full)) continue;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else if (EXTS.has(extname(name)) && !name.endsWith(".test.tsx")) acc.push(full);
  }
  return acc;
}

/** Empreinte stable d'une violation (indépendante du n° de ligne). */
function fingerprint(rel, text) {
  return `${rel}::${text.trim().replace(/\s+/g, " ")}`;
}

function collect() {
  const files = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);
  const found = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      if (line.includes(ALLOW_MARK)) return;
      for (const chunk of extractChunks(line)) {
        if (looksLikeUiText(chunk)) {
          found.push({ file: rel, line: idx + 1, text: chunk.trim(), fp: fingerprint(rel, chunk) });
        }
      }
    });
  }
  return { scanned: files.length, found };
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return null;
  try {
    return new Set(JSON.parse(readFileSync(BASELINE, "utf8")));
  } catch {
    return new Set();
  }
}

function main() {
  const reseed = process.argv.includes("--reseed");
  const { scanned, found } = collect();

  if (reseed) {
    mkdirSync(dirname(BASELINE), { recursive: true });
    const fps = [...new Set(found.map((v) => v.fp))].sort();
    writeFileSync(BASELINE, JSON.stringify(fps, null, 2) + "\n", "utf8");
    console.log(`\n  Lint strings — baseline regelée : ${fps.length} string(s) legacy figée(s).`);
    console.log(`  ${relative(ROOT, BASELINE)}\n`);
    process.exit(0);
  }

  const baseline = loadBaseline();
  console.log(`\n  Lint strings (texte UI en dur) — ${scanned} fichier(s) .tsx scanné(s)`);
  console.log(`  Périmètre : ${SCAN_DIRS.join("  +  ")}  (hors ${EXCLUDE.join(", ")})`);

  if (baseline === null) {
    console.warn(
      `  ⚠ aucune baseline (gate/strings-baseline.json) — lance « node scripts/lint-strings.mjs --reseed » une fois.`,
    );
    console.warn(`    ${found.length} string(s) candidate(s) détectée(s), non bloquantes tant que la baseline n'existe pas.\n`);
    process.exit(0);
  }

  const fresh = found.filter((v) => !baseline.has(v.fp));
  console.log(`  Baseline : ${baseline.size} legacy gelée(s) · ${fresh.length} nouvelle(s)\n`);

  if (fresh.length === 0) {
    console.log("  ✓ Aucune NOUVELLE string UI en dur.\n");
    process.exit(0);
  }

  console.error(`  ✗ ${fresh.length} NOUVELLE(S) string(s) UI en dur — passe par UI.* (lib/ui-strings.ts) :\n`);
  for (const v of fresh) {
    console.error(`    ${v.file}:${v.line}  » ${v.text}`);
    console.error(`        → ajoute la clé dans lib/ui-strings.ts puis référence UI.<ns>.<clé>\n`);
  }
  console.error(`  (legacy à résorber : édite puis « npm run lint:strings -- --reseed » ; échappatoire : ${ALLOW_MARK})\n`);
  process.exit(1);
}

main();
