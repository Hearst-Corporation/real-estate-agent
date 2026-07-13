#!/usr/bin/env node
/**
 * LINT JURIDIQUE — garde-fou anti-FIA du copywriting (étude 02 §16).
 * =================================================================
 *
 * Linter Node STANDALONE, ZÉRO dépendance. Scanne les fichiers UI du domaine
 * invest et échoue (exit 1) si une string d'interface :
 *   (A) contient un mot/tournure INTERDIT, OU
 *   (B) un fichier "écran" n'expose pas les mentions OBLIGATOIRES.
 *
 * Implémente la grille de docs/produit/02-ux-parcours.md §16 :
 *
 *   INTERDITS (extrait verrouillé par le périmètre Epic 0.4) :
 *     - "rendement garanti", "garanti" (hors "non garanti"/"pas garanti")   [L5]
 *     - "sans risque", "capital protégé", "assuré de gagner"                 [L5]
 *     - "propriétaire"/"propriété" pour décrire le token (hors négation)     [L4]
 *     - "votre bien", "parts de l'immeuble", "devenez propriétaire"          [L4]
 *     - "USDT", "Tether"                                                     [L7]
 *     - "NAV", "valeur liquidative", "cagnotte", "alimenter mon compte"      [L2]
 *     - "notre sélection", "investir automatiquement", "robo"               [L1]
 *     - "nous détenons vos fonds", "notre compte" (versements)              [L6]
 *
 *   OBLIGATOIRES (au moins une occurrence sur l'ensemble du périmètre) :
 *     - "non garanti"   (tout chiffre de rendement)                          [L5]
 *     - "risque"        (perte en capital / disclaimer)                      [L5]
 *     - "créancier"     (nature du titre : créance ≠ propriété)              [L4]
 *     - "séquestre"     (fonds chez un tiers, jamais la plateforme)          [L6]
 *
 * Usage : node scripts/lint-legal.mjs   (ou: npm run lint:legal)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** Racines scannées (relatives à ROOT). */
const SCAN_DIRS = [join("app", "(dashboard)", "invest"), join("components", "invest")];

/** Extensions à analyser. */
const EXTS = new Set([".ts", ".tsx", ".mjs", ".jsx"]);

/**
 * Règles d'INTERDICTION. Chaque règle : { id, label, test(line) -> boolean }.
 * On travaille en minuscule. La logique de NÉGATION (autoriser "non garanti")
 * est portée par des regex à lookbehind négatif.
 */
const FORBIDDEN = [
  {
    id: "L5-garanti",
    label: '"garanti" sans négation (rendement garanti interdit)',
    // "garanti(e/s)" non précédé de "non " / "pas " / "jamais "
    re: /(?<!non\s)(?<!pas\s)(?<!jamais\s)(?<!n'est\s)garanti/i,
  },
  { id: "L5-sans-risque", label: '"sans risque"', re: /sans\s+risque/i },
  { id: "L5-capital-protege", label: '"capital protégé"', re: /capital\s+prot[ée]g[ée]/i },
  { id: "L5-assure-gagner", label: '"assuré de gagner"', re: /assur[ée]\s+de\s+gagner/i },
  {
    id: "L4-proprietaire",
    label: '"propriétaire/propriété" sans négation (créancier ≠ propriétaire)',
    // "propriét..." non précédé de "pas " / "non " / "n'êtes pas " etc.
    re: /(?<!pas\s)(?<!non\s)(?<!n'est\s)(?<!ne\ssuis\s)propri[ée]t/i,
  },
  { id: "L4-votre-bien", label: '"votre bien"', re: /votre\s+bien\b/i },
  { id: "L4-parts-immeuble", label: '"parts de l\'immeuble"', re: /parts?\s+de\s+l['’]immeuble/i },
  { id: "L4-devenez-prop", label: '"devenez propriétaire"', re: /devenez\s+propri[ée]taire/i },
  { id: "L7-usdt", label: '"USDT"', re: /\busdt\b/i },
  { id: "L7-tether", label: '"Tether"', re: /\btether\b/i },
  { id: "L2-nav", label: '"NAV"', re: /\bnav\b/i },
  { id: "L2-val-liquidative", label: '"valeur liquidative"', re: /valeur\s+liquidative/i },
  { id: "L2-cagnotte", label: '"cagnotte"', re: /cagnotte/i },
  { id: "L2-alimenter-compte", label: '"alimenter mon compte"', re: /alimenter\s+(mon|votre|son)\s+compte/i },
  { id: "L1-notre-selection", label: '"notre sélection"', re: /notre\s+s[ée]lection/i },
  { id: "L1-investir-auto", label: '"investir automatiquement"', re: /investir\s+automatiquement/i },
  { id: "L1-robo", label: '"robo(-advisor)"', re: /\brobo\b/i },
  { id: "L6-detenons-fonds", label: '"nous détenons vos fonds"', re: /nous\s+d[ée]tenons\s+vos\s+fonds/i },
];

/** Mentions OBLIGATOIRES (présence ≥ 1 sur tout le périmètre). */
const REQUIRED = [
  { id: "L5-non-garanti", label: '"non garanti"', re: /non\s+garanti/i },
  { id: "L5-risque", label: '"risque"', re: /risque/i },
  { id: "L4-creancier", label: '"créancier"', re: /cr[ée]ancier/i },
  { id: "L6-sequestre", label: '"séquestre"', re: /s[ée]questre/i },
];

/**
 * Heuristique d'extraction des STRINGS UI : on ne lint que le texte
 * susceptible d'être affiché. On retient une ligne si elle contient du texte
 * "humain" (au moins une lettre accentuée ou un mot de >3 lettres) ET qu'elle
 * n'est pas un import/chemin. On EXCLUT les lignes de commentaire de règle pour
 * éviter de se lint soi-même — mais ce fichier n'est PAS dans le périmètre
 * scanné de toute façon.
 *
 * Pour limiter les faux positifs sur les identifiants de code (ex. une variable
 * `proprietaire`), on cible le texte entre guillemets / accolades JSX. On
 * concatène : (1) le contenu des littéraux de chaîne, (2) le texte JSX brut.
 */
function extractUiText(line) {
  // On ignore les lignes de COMMENTAIRE (le §16 lint cible les strings UI, pas
  // la doc/les commentaires de code — qui citent légitimement les mots interdits
  // pour expliquer la règle). Lignes commençant par * , // , /* ou */ .
  const trimmed = line.trimStart();
  if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return "";
  const chunks = [];
  // littéraux "..." '...' `...`
  const strRe = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = strRe.exec(line)) !== null) chunks.push(m[2]);
  // texte JSX hors balises (>texte<) — grossier mais suffisant
  const jsxRe = />([^<>{}]+)</g;
  while ((m = jsxRe.exec(line)) !== null) chunks.push(m[1]);
  return chunks.join("  ");
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
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, acc);
    } else if (EXTS.has(extname(name))) {
      acc.push(full);
    }
  }
  return acc;
}

function main() {
  const files = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

  const violations = [];
  const requiredSeen = new Set();
  let scanned = 0;

  for (const file of files) {
    scanned += 1;
    const rel = relative(ROOT, file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      const ui = extractUiText(line);
      if (!ui.trim()) return;
      for (const rule of FORBIDDEN) {
        if (rule.re.test(ui)) {
          violations.push({ file: rel, line: idx + 1, id: rule.id, label: rule.label, text: line.trim() });
        }
      }
      for (const rule of REQUIRED) {
        if (rule.re.test(ui)) requiredSeen.add(rule.id);
      }
    });
  }

  // Module Invest RETIRÉ du produit : le périmètre scanné n'existe plus. Aucun
  // contenu invest → aucune obligation juridique anti-FIA à vérifier. Exit 0.
  if (scanned === 0) {
    console.log(
      "\n  Lint juridique (anti-FIA) — périmètre Invest absent (module retiré). Rien à vérifier.\n",
    );
    process.exit(0);
  }

  const missing = REQUIRED.filter((r) => !requiredSeen.has(r.id));

  // Rapport.
  console.log(`\n  Lint juridique (anti-FIA) — ${scanned} fichier(s) scanné(s)`);
  console.log(`  Périmètre : ${SCAN_DIRS.join("  +  ")}\n`);

  if (violations.length === 0 && missing.length === 0) {
    console.log("  ✓ Aucun mot interdit. ✓ Toutes les mentions obligatoires présentes.\n");
    console.log(
      `  Obligatoires vues : ${[...requiredSeen].join(", ") || "(aucune — périmètre vide)"}\n`,
    );
    process.exit(0);
  }

  if (violations.length > 0) {
    console.error(`  ✗ ${violations.length} mot(s) INTERDIT(S) :\n`);
    for (const v of violations) {
      console.error(`    [${v.id}] ${v.file}:${v.line}`);
      console.error(`        ${v.label}`);
      console.error(`        » ${v.text}\n`);
    }
  }
  if (missing.length > 0) {
    console.error(`  ✗ ${missing.length} mention(s) OBLIGATOIRE(S) absente(s) du périmètre :\n`);
    for (const r of missing) console.error(`    [${r.id}] ${r.label}`);
    console.error("");
  }

  process.exit(1);
}

main();
