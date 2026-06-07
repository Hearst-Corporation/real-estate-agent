#!/usr/bin/env node
/**
 * MANIFESTE COCKPIT — vocabulaire du design system, auto-généré.
 * =================================================================
 *
 * Script Node STANDALONE, ZÉRO dépendance. Extrait des sections CSS
 * (`app/cockpit/*.css`, repli `app/cockpit.css`) la liste des tokens
 * `--ct-*` définis et des classes `ct-*` disponibles, et l'écrit dans
 * `components/cockpit/manifest.json`.
 *
 * But : un agent (ou l'humain) connaît le vocabulaire EXACT sans lire les
 * milliers de lignes de CSS. `components/cockpit/AGENTS.md` y renvoie.
 *
 * Usage :
 *   node scripts/gen-cockpit-manifest.mjs           → (ré)écrit le manifeste
 *   node scripts/gen-cockpit-manifest.mjs --check    → exit 1 si périmé (CI)
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "components", "cockpit", "manifest.json");

const TOKEN_RE = /--ct-[a-z0-9-]+/g;
const CLASS_RE = /\.(ct-[a-z0-9-]+)/g;

/** Fichiers CSS source (sections, sinon monolithe). */
function cssSources() {
  const dir = join(ROOT, "app", "cockpit");
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".css"))
      .sort()
      .map((f) => join(dir, f));
  } catch {
    return [join(ROOT, "app", "cockpit.css")];
  }
}

function build() {
  const tokens = new Set();
  const classes = new Set();
  const sources = [];

  for (const path of cssSources()) {
    let raw;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    sources.push(path.replace(ROOT + "/", ""));
    for (const m of raw.matchAll(TOKEN_RE)) tokens.add(m[0]);
    for (const m of raw.matchAll(CLASS_RE)) classes.add(m[1]);
  }

  const sortedTokens = [...tokens].sort();
  const sortedClasses = [...classes].sort();

  return {
    $comment:
      "AUTO-GÉNÉRÉ par scripts/gen-cockpit-manifest.mjs — ne pas éditer à la main. Régénère : npm run cockpit:manifest",
    sources,
    counts: { tokens: sortedTokens.length, classes: sortedClasses.length },
    tokens: sortedTokens,
    classes: sortedClasses,
  };
}

const json = JSON.stringify(build(), null, 2) + "\n";
const isCheck = process.argv.includes("--check");

if (isCheck) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    /* absent → périmé */
  }
  if (current !== json) {
    console.error(
      "\n  ✗ components/cockpit/manifest.json est périmé (le CSS a changé).\n" +
        "     Régénère-le : npm run cockpit:manifest\n",
    );
    process.exit(1);
  }
  console.log("  ✓ Manifeste cockpit à jour.");
  process.exit(0);
}

writeFileSync(OUT, json, "utf8");
const { counts } = JSON.parse(json);
console.log(
  `\n  ✓ components/cockpit/manifest.json écrit — ${counts.tokens} tokens, ${counts.classes} classes.\n`,
);
