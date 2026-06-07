#!/usr/bin/env node
/**
 * LINT NAVIGATION — garde-fou cohérence pages ↔ manifeste NAV.
 * =================================================================
 *
 * Linter Node STANDALONE, ZÉRO dépendance. Garantit que toute page de premier
 * niveau sous `app/(dashboard)/` est soit déclarée dans `NAV` (config/nav.ts),
 * soit hors-rail VOLONTAIRE (allowlist). Une page sans entrée de nav devient
 * inaccessible au rail gauche → on échoue (exit 1) pour forcer l'ajout NAV.
 *
 *   Détection des pages :
 *     - segment de 1er niveau sous app/(dashboard)/<segment>/page.tsx
 *     - on ignore les groupes de route `(xxx)` et les segments dynamiques `[id]`
 *
 *   Détection des routes NAV :
 *     - lecture TEXTE de config/nav.ts (pas d'import TS) : on extrait tous les
 *       href "/<segment>" du tableau NAV via regex.
 *
 *   Allowlist (hors-rail assumé — pages non liées au rail gauche) :
 *     profile · admin · invest
 *
 *   ÉCHEC (exit 1) — un segment a un page.tsx mais :
 *     - pas d'entrée href "/<segment>" dans NAV, ET
 *     - pas dans l'allowlist.
 *
 * Usage : node scripts/lint-nav.mjs   (ou: npm run lint:nav)
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** Racine des pages dashboard. */
const DASHBOARD_DIR = join(ROOT, "app", "(dashboard)");

/** Manifeste de navigation (lu en texte brut). */
const NAV_FILE = join(ROOT, "config", "nav.ts");

/** Pages hors-rail volontaires (pas d'entrée NAV attendue). */
const ALLOWLIST = ["profile", "admin", "invest"];

/**
 * Liste les segments de premier niveau qui contiennent un `page.tsx`.
 * On ignore les groupes de route `(xxx)` et les segments dynamiques `[id]`.
 */
function listPageSegments() {
  let entries;
  try {
    entries = readdirSync(DASHBOARD_DIR);
  } catch {
    return [];
  }
  const segments = [];
  for (const name of entries) {
    if (name.startsWith("(") || name.startsWith("[")) continue;
    const full = join(DASHBOARD_DIR, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    if (existsSync(join(full, "page.tsx"))) segments.push(name);
  }
  return segments.sort();
}

/**
 * Extrait l'ensemble des href "/<segment>" déclarés dans NAV de config/nav.ts.
 * Lecture TEXTE (pas d'import du module TS). On capture tout `href: "/xxx"`.
 */
function navHrefs() {
  let raw;
  try {
    raw = readFileSync(NAV_FILE, "utf8");
  } catch {
    return new Set();
  }
  const hrefs = new Set();
  const re = /href\s*:\s*["'`]\/([a-z0-9-]+)/gi;
  let m;
  while ((m = re.exec(raw)) !== null) hrefs.add(m[1].toLowerCase());
  return hrefs;
}

function main() {
  const segments = listPageSegments();
  const hrefs = navHrefs();
  const allow = new Set(ALLOWLIST);

  const orphans = segments.filter((s) => !hrefs.has(s) && !allow.has(s));

  console.log(`\n  Lint navigation (pages ↔ NAV) — ${segments.length} page(s) dashboard scannée(s)`);
  console.log(`  Manifeste : ${relative(ROOT, NAV_FILE)}`);
  console.log(`  Allowlist hors-rail : ${ALLOWLIST.join(", ")}\n`);

  if (orphans.length === 0) {
    console.log("  ✓ Toutes les pages dashboard ont une entrée NAV (ou sont hors-rail assumées).\n");
    process.exit(0);
  }

  console.error(`  ✗ ${orphans.length} page(s) ORPHELINE(S) — sans entrée NAV ni allowlist :\n`);
  for (const seg of orphans) {
    console.error(`    app/(dashboard)/${seg}/page.tsx  →  href "/${seg}" absent de NAV`);
    console.error(
      `        → ajoute l'entrée dans NAV (config/nav.ts) :`,
    );
    console.error(
      `          { href: "/${seg}", label: UI.nav.${seg}, icon: "<IconName>", group: "primary" }`,
    );
    console.error(
      `          (ou ajoute "${seg}" à l'allowlist de scripts/lint-nav.mjs si la page est hors-rail volontaire)\n`,
    );
  }
  process.exit(1);
}

main();
