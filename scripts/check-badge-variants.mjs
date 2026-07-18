#!/usr/bin/env node
/**
 * Garde des badges Azigo (REA-UX-012, lot badges).
 * =================================================================
 *
 * Interdit par audit de source que des couleurs SaaS génériques reviennent sur
 * les badges. Un badge classifie une information ; il n'alerte pas.
 *
 *   1. `<Badge color=…>` interdit : la primitive n'accepte plus `color`, mais
 *      seulement `variant` parmi { neutral, outline, brand, strong }.
 *   2. `variant="warning|success|danger|info|…"` interdit : la prop décrit un
 *      POIDS visuel, pas une sémantique colorée.
 *   3. aucune définition de composant Badge LOCAL hors les primitives canoniques
 *      (`components/ui/badge.tsx`, `components/cockpit/primitives.tsx`) : pas de
 *      badge maison par domaine.
 *
 * Exemptés (couleur réglementaire / donnée intrinsèque, hors palette produit) :
 *   - DpeBadge (couleurs DPE officielles A→G).
 *
 * Autonome (zéro dépendance), exit(1) au premier lot de violations.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];

const ALLOWED = new Set(["neutral", "outline", "brand", "strong"]);

// Fichiers autorisés à définir/porter une couleur de badge hors palette (données
// intrinsèques réglementaires), ou primitives canoniques.
const EXEMPT = [
  /^components\/ui\/badge\.tsx$/,
  /^components\/cockpit\/primitives\.tsx$/,
  /^app\/\(dashboard\)\/properties\/\[id\]\/_components\/DpeBadge\.tsx$/,
];

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (e === "node_modules" || e === ".next") continue;
      walk(full, acc);
    } else if (/\.(tsx|ts)$/.test(e)) {
      acc.push(full);
    }
  }
  return acc;
}

function isExempt(rel) {
  return EXEMPT.some((re) => re.test(rel));
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const violations = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  if (isExempt(rel)) continue;
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");

  lines.forEach((line, i) => {
    const n = i + 1;

    // 1. <Badge color=…>
    if (/<Badge\s+[^>]*\bcolor=/.test(line)) {
      violations.push(`${rel}:${n} : <Badge color=…> interdit → <Badge variant="neutral|outline|brand|strong">`);
    }

    // 2. variant="<hors liste>" sur un Badge
    const m = line.match(/<Badge\s+[^>]*\bvariant=["']([a-z]+)["']/);
    if (m && !ALLOWED.has(m[1])) {
      violations.push(`${rel}:${n} : variant="${m[1]}" invalide → { neutral, outline, brand, strong }`);
    }
  });

  // 3. WRAPPER local autour de la primitive <Badge> (ex. RecoBadge, LiveBadge,
  //    ChannelBadge) : interdit, la couleur/variante ne doit pas être recalculée
  //    dans un composant maison par domaine. On ne cible QUE les composants dont
  //    le nom finit par « Badge » ET qui rendent un <Badge> (wrappent la
  //    primitive). Les pastilles <span> légitimes (SourceBadge, SignalBadge) et
  //    les fonctions utilitaires (expiryBadge → {label}) ne sont pas concernées.
  const wrapper = /\b(?:function|const)\s+(\w*Badge)\b[\s\S]{0,600}?<Badge[\s>]/.exec(src);
  if (wrapper) {
    violations.push(
      `${rel} : ${wrapper[1]} wrappe <Badge> localement — appeler directement <Badge variant> (pas de wrapper de badge par domaine).`,
    );
  }
}

if (violations.length) {
  console.error(`\n✗ check:badges — ${violations.length} violation(s) :\n`);
  for (const v of violations.slice(0, 200)) console.error(`  ${v}`);
  if (violations.length > 200) console.error(`  … et ${violations.length - 200} de plus.`);
  console.error("");
  process.exit(1);
}

console.log("✓ check:badges — badges 100% variantes Azigo (neutral/outline/brand/strong).");
