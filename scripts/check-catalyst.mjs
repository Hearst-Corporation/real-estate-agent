#!/usr/bin/env node
/**
 * Gate Catalyst — interdit le markup natif et les couleurs hors accent dans le
 * dashboard (app/(dashboard)/ + components/), pour forcer l'usage des primitives
 * Catalyst (components/ui/) et l'accent unique.
 *
 * Exemptés : components/ui/* (les primitives Catalyst — markup natif = leur job).
 *
 * Autonome (zéro dépendance), exit(1) au premier lot de violations.
 *
 * NOTE : tant que la refonte Catalyst n'est pas terminée sur toutes les pages,
 * ce script N'EST PAS branché sur `npm run check` (il serait rouge sur le DS
 * Cockpit résiduel). Il se lance à la main : `npm run check:catalyst`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app/(dashboard)", "components"];
const EXEMPT = [
  // Primitives Catalyst — le markup natif, c'est leur rôle.
  /^components\/ui\//,
  // Template CSS de brochure PDF (document imprimable autonome) — hex légitimes.
  /^components\/brochure\//,
  // Data-viz / graphes SVG & badges d'état sémantiques (pas d'équivalent Catalyst,
  // couleurs porteuses de sens : statut, courbe, jauge). Gardés par la charte.
  /^components\/invest\/(StatusPill|ProductBadges|Banner|Toast|Timeline|Stepper|ScenarioBars|Waterfall|Gauge|SensitivityCurve|LegalNatureBadge|RiskRadar)\.tsx$/,
  /^components\/cockpit\/(Donut|BarList|Funnel|LeadKanban|PropertyKanban)\.tsx$/,
  /^components\/swarms\/RunStatusBadge\.tsx$/,
  // Providers analytics (aucune UI rendue).
  /^components\/providers\//,
];

const ACCENT = "indigo"; // l'unique accent non-neutre autorisé
const NON_NEUTRAL =
  "cyan|red|orange|amber|yellow|lime|green|emerald|teal|sky|blue|violet|purple|fuchsia|pink|rose|indigo";

const RULES = [
  {
    id: "native-button",
    re: /<button(\s|>)/g,
    msg: "<button> natif interdit → <Button> (components/ui/button)",
  },
  {
    id: "native-input",
    re: /<input(\s|>)/g,
    msg: "<input> natif interdit → <Input>/<Field> (components/ui/input, fieldset)",
  },
  {
    id: "native-select",
    re: /<select(\s|>)/g,
    msg: "<select> natif interdit → <Select> (components/ui/select)",
  },
  {
    id: "native-textarea",
    re: /<textarea(\s|>)/g,
    msg: "<textarea> natif interdit → <Textarea> (components/ui/textarea)",
  },
  {
    id: "native-table",
    re: /<table(\s|>)/g,
    msg: "<table> natif interdit → <Table> (components/ui/table)",
  },
  {
    id: "hardcoded-hex",
    re: /#[0-9a-fA-F]{3,8}\b/g,
    msg: "couleur #hex en dur interdite → token (--color-accent-* ou zinc)",
  },
  {
    id: "hardcoded-rgb",
    re: /\brgba?\(/g,
    msg: "rgb()/rgba() en dur interdit → token",
  },
  {
    id: "arbitrary-spacing",
    re: /\b[pmg][trblxy]?-\[\d+px\]/g,
    msg: "spacing arbitraire (ex p-[13px]) interdit → échelle fixe",
  },
];

// Couleur non-accent utilisée comme classe utilitaire (bg/text/border/ring-<couleur>-NNN)
const OFF_ACCENT_RE = new RegExp(
  `\\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|shadow|accent|caret)-(${NON_NEUTRAL})-\\d{2,3}\\b`,
  "g"
);

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
    } else if (/\.(tsx|ts|jsx|js|css)$/.test(e)) {
      acc.push(full);
    }
  }
  return acc;
}

function isExempt(relPath) {
  return EXEMPT.some((re) => re.test(relPath));
}

// Composants d'ÉTAT (statut d'exécution / run / action destructive / message
// d'erreur) : les couleurs sémantiques (red=erreur, amber=en cours, lime=succès)
// y sont porteuses de sens, comme le sont les couleurs d'état sur <Badge color>.
// Ces fichiers restent soumis aux règles natif/hex — seule la règle "hors accent"
// est levée (couleur d'état tolérée).
const STATE_COLOR_OK = [
  /^components\/missions\/MissionLive\.tsx$/,
  /^components\/missions\/MissionLauncher\.tsx$/,
  /^components\/swarms\/RunReport\.tsx$/,
  /^components\/swarms\/SwarmKickoffPanel\.tsx$/,
  /^components\/cockpit\/DeleteButton\.tsx$/,
  /^components\/cockpit\/StatusSelect\.tsx$/,
  /^components\/cockpit\/ChatKimi\.tsx$/,
  /^app\/\(dashboard\)\/properties\/_components\/PropertiesViewToggle\.tsx$/,
  /^app\/\(dashboard\)\/properties\/\[id\]\/_components\/PhotoGallery\.tsx$/,
  /^app\/\(dashboard\)\/offmarket\/page\.tsx$/,
  /^app\/\(dashboard\)\/offmarket\/_components\/OffmarketExplorer\.tsx$/,
  // Couleurs sémantiques d'état (statut brouillon/envoyé/échec, urgence, en attente) — REA-PRODUCT-007
  /^app\/\(dashboard\)\/approvals\/_components\/ApprovalsInbox\.tsx$/,
  /^app\/\(dashboard\)\/outbox\/_components\/OutboxBoard\.tsx$/,
  /^app\/\(dashboard\)\/properties\/\[id\]\/owner-report\/page\.tsx$/,
  /^components\/timeline\/Timeline\.tsx$/,
  /^components\/value-evolution\/ValueSparkline\.tsx$/,
  // Couleurs sémantiques d'état (proposition mandat, issue de visite) — REA-PRODUCT-008
  /^app\/\(dashboard\)\/mandate-renewal\/page\.tsx$/,
  /^app\/\(dashboard\)\/visits\/_components\/PostVisitLoop\.tsx$/,
];
function stateColorAllowed(relPath) {
  return STATE_COLOR_OK.some((re) => re.test(relPath));
}

const violations = [];

for (const d of SCAN_DIRS) {
  for (const file of walk(join(ROOT, d))) {
    const rel = relative(ROOT, file);
    if (isExempt(rel)) continue;
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");

    for (const rule of RULES) {
      lines.forEach((line, i) => {
        rule.re.lastIndex = 0;
        if (rule.re.test(line)) {
          violations.push({ rel, line: i + 1, msg: rule.msg });
        }
      });
    }

    // Couleur hors accent (levée sur les composants d'état sémantique)
    const stateOk = stateColorAllowed(rel);
    lines.forEach((line, i) => {
      if (stateOk) return;
      OFF_ACCENT_RE.lastIndex = 0;
      let m;
      while ((m = OFF_ACCENT_RE.exec(line)) !== null) {
        if (m[1] !== ACCENT) {
          violations.push({
            rel,
            line: i + 1,
            msg: `couleur hors accent "${m[1]}" (classe ${m[0]}) → accent unique "${ACCENT}" ou zinc`,
          });
        }
      }
    });
  }
}

if (violations.length) {
  console.error(`\n✗ check:catalyst — ${violations.length} violation(s) :\n`);
  for (const v of violations.slice(0, 200)) {
    console.error(`  ${v.rel}:${v.line}  ${v.msg}`);
  }
  if (violations.length > 200) {
    console.error(`  … et ${violations.length - 200} de plus.`);
  }
  console.error("");
  process.exit(1);
}

console.log("✓ check:catalyst — dashboard 100% primitives Catalyst, accent unique.");
