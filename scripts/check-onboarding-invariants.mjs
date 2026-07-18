#!/usr/bin/env node
/**
 * Invariants d'onboarding (REA-UX-012, LOT 1).
 * =================================================================
 *
 * Garantit, par audit de source, que l'aide a UN SEUL point d'accès permanent et
 * que l'ancien dock flottant à trois commandes ne peut pas réapparaître :
 *
 *   1. exactement UN montage `<OnboardingLauncher` dans tout le code ;
 *   2. aucun ancien dock `fixed … bottom-… left-…` regroupant les trois
 *      commandes onboarding (checklist + aide + « Découvrir cette page ») ;
 *   3. aucun bouton « Découvrir cette page » injecté directement dans une page
 *      métier (la logique route-aware vit dans HelpPanel, pas dans les pages) ;
 *   4. le composant `PageTourButton` n'est plus rendu comme commande globale.
 *
 * Autonome (zéro dépendance), exit(1) au premier lot de violations.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];

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

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const violations = [];

// ── 1. Exactement un montage <OnboardingLauncher /> ──
let launcherMounts = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  // Montage JSX (pas l'import ni la définition de la fonction).
  const mounts = src.match(/<OnboardingLauncher[\s/>]/g);
  if (mounts) {
    launcherMounts += mounts.length;
    if (mounts.length > 1) {
      violations.push(`${rel} : ${mounts.length} montages <OnboardingLauncher> dans un même fichier`);
    }
  }
}
if (launcherMounts === 0) {
  violations.push("Aucun montage <OnboardingLauncher> trouvé — l'onboarding n'est pas monté.");
} else if (launcherMounts > 1) {
  violations.push(`${launcherMounts} montages <OnboardingLauncher> au total — il en faut exactement UN.`);
}

// ── 2 + 3. Analyse par fichier ──
for (const file of files) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");

  lines.forEach((line, i) => {
    const n = i + 1;

    // 2. Ancien dock flottant regroupant les commandes onboarding : un conteneur
    //    `fixed` ancré en bas qui embarque la checklist onboarding. On cible le
    //    marqueur précis de l'ancien dock (classe `bottom-20`/`bottom-4` + `left-`
    //    dans un fichier onboarding) plutôt que tout `fixed` légitime ailleurs.
    if (
      /\bfixed\b/.test(line) &&
      /\bbottom-(?:4|16|20|24)\b/.test(line) &&
      /\bleft-(?:4|rail-left)\b/.test(line) &&
      /onboarding/i.test(rel)
    ) {
      violations.push(
        `${rel}:${n} : dock flottant onboarding interdit (fixed bottom-* left-*) — l'aide passe par l'entrée de navigation.`,
      );
    }

    // 3. « Découvrir cette page » injecté dans une page métier (app/(dashboard)/…
    //    hors du dossier onboarding). Le libellé ne doit vivre que dans HelpPanel.
    if (
      /Découvrir cette page/.test(line) &&
      rel.startsWith("app/") &&
      !/onboarding/i.test(rel)
    ) {
      violations.push(
        `${rel}:${n} : « Découvrir cette page » injecté dans une page — la visite de page vit dans HelpPanel.`,
      );
    }
  });

  // 4. PageTourButton rendu comme composant (JSX). Son import de type/logique est
  //    permis ; son rendu comme commande globale ne l'est plus.
  if (/<PageTourButton[\s/>]/.test(src)) {
    violations.push(`${rel} : <PageTourButton> rendu — retiré comme commande globale (LOT 1).`);
  }
}

if (violations.length) {
  console.error(`\n✗ check:onboarding — ${violations.length} violation(s) :\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error("");
  process.exit(1);
}

console.log("✓ check:onboarding — un seul point d'accès à l'aide, aucun dock flottant.");
