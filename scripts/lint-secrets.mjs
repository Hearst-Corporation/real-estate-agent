#!/usr/bin/env node
// @enable-adrien:layer=front-cockpit v=1
/**
 * LINT SECRETS — garde-fou anti-clé-en-dur (portable tous tiers).
 * =================================================================
 *
 * Linter Node STANDALONE, ZÉRO dépendance. Échoue (exit 1) si une clé d'API /
 * token réel apparaît EN DUR dans le code source. La règle « aucune clé
 * hardcodée — toujours process.env.X » (CLAUDE.md) n'était appliquée par AUCUN
 * linter : ce fichier comble ce trou.
 *
 * PRINCIPE (leçon terrain) : on ne teste que le CONTENU des LITTÉRAUX de chaîne,
 * jamais une ligne brute. Un vrai secret est toujours dans une string ; tester
 * les identifiants de code (ex. `derniere_republication_at`) génère des faux
 * positifs (« re_ » au milieu d'un mot). Les regex exigent en plus la FORME
 * complète de chaque préfixe (longueur réaliste), pas juste « re_ ».
 *
 * CONFIDENTIALITÉ : ne logge JAMAIS la valeur — seulement `fichier:ligne` + le
 * préfixe détecté. Aucun secret ne transite par la sortie.
 *
 * Zones EXCLUES (secret légitime / hors code) :
 *   - *.env*                    → c'est LE bon endroit
 *   - docs/api-config/**        → catalogue de services (gitignored)
 *   - fichiers .bak, node_modules, .next, dist, lib/supabase/database.types.ts
 *
 * Échappatoire ponctuelle : `secret-lint-allow` en commentaire de la ligne.
 *
 * Usage : node scripts/lint-secrets.mjs   (ou: npm run lint:secrets)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** Racines scannées. */
const SCAN_DIRS = ["app", "components", "lib", "config", "scripts", "electron"];

/** Extensions analysées. */
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** Marqueur d'exemption en commentaire de ligne. */
const ALLOW_MARK = "secret-lint-allow";

/** Chemins exclus (secret légitime ou bruit). */
const ALLOW_PATHS = [
  /\.env/,
  /\/docs\/api-config\//,
  /\.bak$/,
  /node_modules/,
  /\.next\//,
  /\/dist/,
  /lib\/supabase\/database\.types\.ts$/,
  /scripts\/lint-secrets\.mjs$/, // self-exempt (contient les préfixes en regex)
];

/**
 * Préfixes de secrets RÉELS, forme complète exigée (faible faux-positif).
 * `re_` (Resend) est en deux segments séparés par `_` pour ne pas matcher
 * « derniere_republication ». JWT = trois segments base64url.
 */
const SECRET_RES = [
  { id: "anthropic", re: /\bsk-ant-[A-Za-z0-9_-]{30,}/ },
  { id: "openai", re: /\bsk-proj-[A-Za-z0-9_-]{30,}/ },
  { id: "github", re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { id: "hypercli", re: /\bhyper_api_[A-Za-z0-9]{30,}/ },
  { id: "resend", re: /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}/ },
  { id: "slack-bot", re: /\bxoxb-[A-Za-z0-9-]{20,}/ },
  { id: "jwt", re: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/ },
];

/** Contenus des littéraux de chaîne d'une ligne (on ne teste QUE ça). */
function stringLiterals(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return [];
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(line)) !== null) out.push(m[2]);
  return out;
}

function isExcluded(rel) {
  return ALLOW_PATHS.some((re) => re.test(rel));
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
    const rel = relative(ROOT, full);
    if (isExcluded(rel)) continue;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else if (EXTS.has(extname(name))) acc.push(full);
  }
  return acc;
}

function main() {
  const files = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

  const violations = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      if (line.includes(ALLOW_MARK)) return;
      for (const lit of stringLiterals(line)) {
        for (const { id, re } of SECRET_RES) {
          if (re.test(lit)) {
            violations.push({ file: rel, line: idx + 1, id });
            break;
          }
        }
      }
    });
  }

  console.log(`\n  Lint secrets — ${files.length} fichier(s) scanné(s)`);
  console.log(`  Périmètre : ${SCAN_DIRS.join("  +  ")}\n`);

  if (violations.length === 0) {
    console.log("  ✓ Aucune clé/token en dur dans le code.\n");
    process.exit(0);
  }

  console.error(`  ✗ ${violations.length} secret(s) EN DUR — interdits :\n`);
  for (const v of violations) {
    // on n'imprime JAMAIS la valeur — seulement l'emplacement + le type de clé
    console.error(`    ${v.file}:${v.line}  (préfixe ${v.id})`);
    console.error(`        → déplace dans .env.local et lis via process.env.X (jamais en dur)\n`);
  }
  process.exit(1);
}

main();
