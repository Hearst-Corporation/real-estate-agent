#!/usr/bin/env node
/**
 * LINT COCKPIT — garde-fou tokens du design system.
 * =================================================================
 *
 * Linter Node STANDALONE, ZÉRO dépendance. Garantit que la surface UI cockpit
 * reste 100% pilotée par les tokens `--ct-*` / les classes `ct-*`, jamais par
 * des couleurs en dur. C'est le filet automatique qui permet à un agent de
 * s'auto-corriger AVANT de livrer (cf. components/cockpit/AGENTS.md).
 *
 *   ERREUR (exit 1) — dans le périmètre cockpit (.tsx/.ts) :
 *     - couleur hex en dur          #rgb #rrggbb #rrggbbaa
 *     - fonction couleur en dur     rgb() rgba() hsl() hsla()
 *   → remplacer par var(--ct-*) ou une classe ct-*.
 *
 *   AVERTISSEMENT (n'échoue pas) — dans app/cockpit.css :
 *     - hex hors d'un bloc de DÉFINITION de tokens (:root / [data-product] / html)
 *   → idéalement déplacer la valeur en token. Toléré sur l'existant.
 *
 * Zones EXCLUES (hardcode légitime, hors design system cockpit) :
 *     - components/brochure/**   → DS print/PDF autonome (ses propres tokens)
 *     - app/brochure/**          → page de repli standalone (hors shell)
 *     - app/api/**               → templates HTML email (inline obligatoire)
 *
 * Échappatoire ponctuelle : ajouter `cockpit-lint-allow` en commentaire sur la
 * ligne (ex. largeur/teinte pilotée par la donnée) pour la dispenser.
 *
 * Usage : node scripts/lint-cockpit.mjs   (ou: npm run lint:cockpit)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** Racines scannées (surface UI cockpit). */
const SCAN_DIRS = [join("app", "(dashboard)"), "components"];

/** Sous-arbres exclus (hardcode légitime — voir en-tête). */
const EXCLUDE_DIRS = [join("components", "brochure")];

/** Extensions analysées pour la règle ERREUR. */
const EXTS = new Set([".ts", ".tsx", ".jsx"]);

/** Marqueur d'exemption en commentaire. */
const ALLOW_MARK = "cockpit-lint-allow";

/** Motifs de couleur en dur. */
const HEX_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const FUNC_RE = /\b(?:rgba?|hsla?)\s*\(/i;

function isExcluded(full) {
  return EXCLUDE_DIRS.some((d) => full.includes(join(ROOT, d)));
}

function walk(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc; // dossier absent → ignoré
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (isExcluded(full)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (EXTS.has(extname(name))) acc.push(full);
  }
  return acc;
}

/** Vrai si la ligne est un commentaire pur (on ne lint pas les exemples cités). */
function isCommentLine(line) {
  const t = line.trimStart();
  return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
}

/** ERREUR — couleurs en dur dans le code UI. */
function scanCode() {
  const files = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

  const violations = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      if (isCommentLine(line) || line.includes(ALLOW_MARK)) return;
      let kind = null;
      if (HEX_RE.test(line)) kind = "couleur hex en dur";
      else if (FUNC_RE.test(line)) kind = "fonction couleur en dur (rgb/hsl)";
      if (kind) violations.push({ file: rel, line: idx + 1, kind, text: line.trim() });
    });
  }
  return { scanned: files.length, violations };
}

/**
 * AVERTISSEMENT — hex hors bloc de tokens dans le CSS du DS.
 * Scanne les sections `app/cockpit/*.css` (le monolithe a été découpé) ;
 * repli sur `app/cockpit.css` si le dossier n'existe pas.
 */
function cssSources() {
  const dir = join(ROOT, "app", "cockpit");
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".css"))
      .sort()
      .map((f) => ({ name: `cockpit/${f}`, path: join(dir, f) }));
  } catch {
    return [{ name: "cockpit.css", path: join(ROOT, "app", "cockpit.css") }];
  }
}

function scanCss() {
  const isTokenScope = (sel) => /:root|\[data-product|^html\b|,\s*html\b/.test(sel);
  const warns = [];

  for (const src of cssSources()) {
    let raw;
    try {
      raw = readFileSync(src.path, "utf8");
    } catch {
      continue;
    }
    const lines = raw.split("\n");
    // Sélecteur courant = dernier texte avant un "{" non encore fermé.
    let depth = 0;
    let selector = "";
    let pending = "";
    lines.forEach((line, idx) => {
      if (line.includes("{")) {
        if (depth === 0) selector = (pending + " " + line.split("{")[0]).trim();
        depth += (line.match(/{/g) || []).length;
        depth -= (line.match(/}/g) || []).length;
        pending = "";
      } else if (line.includes("}")) {
        depth -= (line.match(/}/g) || []).length;
        if (depth < 0) depth = 0;
        pending = "";
      } else if (depth === 0) {
        pending += " " + line.trim();
      }
      if (depth >= 1 && !isTokenScope(selector) && HEX_RE.test(line) && !line.includes(ALLOW_MARK)) {
        warns.push({ file: src.name, line: idx + 1, selector: selector.slice(0, 60), text: line.trim() });
      }
    });
  }
  return warns;
}

function main() {
  const { scanned, violations } = scanCode();
  const warns = scanCss();

  console.log(`\n  Lint cockpit (tokens DS) — ${scanned} fichier(s) scanné(s)`);
  console.log(`  Périmètre : ${SCAN_DIRS.join("  +  ")}  (hors ${EXCLUDE_DIRS.join(", ")})\n`);

  if (warns.length > 0) {
    console.warn(`  ⚠ ${warns.length} hex hors bloc de tokens dans app/cockpit/*.css (toléré) :`);
    for (const w of warns.slice(0, 20)) {
      console.warn(`    ${w.file}:${w.line}  «${w.selector}»  » ${w.text}`);
    }
    if (warns.length > 20) console.warn(`    … +${warns.length - 20} autre(s)`);
    console.warn("");
  }

  if (violations.length === 0) {
    console.log("  ✓ Aucune couleur en dur dans la surface UI cockpit.\n");
    process.exit(0);
  }

  console.error(`  ✗ ${violations.length} couleur(s) en dur — interdites hors tokens :\n`);
  for (const v of violations) {
    console.error(`    ${v.file}:${v.line}  (${v.kind})`);
    console.error(`        » ${v.text}`);
    console.error(`        → utilise var(--ct-*) ou une classe ct-* — voir components/cockpit/AGENTS.md\n`);
  }
  process.exit(1);
}

main();
