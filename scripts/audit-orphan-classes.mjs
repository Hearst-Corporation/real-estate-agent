import fs from 'fs';
import path from 'path';
import { globSync } from 'fs';

const ROOT = '/Users/adrienbeyondcrypto/Dev/Projects/Real estate Agent';

// ── helpers ──────────────────────────────────────────────────────────────────

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function walkSync(dir, ext, excludes = []) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (excludes.some(x => full.includes(x))) continue;
    if (entry.isDirectory()) results.push(...walkSync(full, ext, excludes));
    else if (entry.isFile() && entry.name.endsWith(ext)) results.push(full);
  }
  return results;
}

// ── STEP A : classes DÉFINIES dans les CSS ───────────────────────────────────

const CSS_PATHS = [
  ...walkSync(path.join(ROOT, 'app/cockpit'), '.css'),
  path.join(ROOT, 'app/globals.css'),
];

const definedClasses = new Set();
const classInCSSRe = /\.(-?[a-zA-Z][a-zA-Z0-9_-]*)(?=[^{]*\{|\s*[,{]|\s*>|\s*\+|\s*~|\s*\[|\s*:|::)/g;

for (const p of CSS_PATHS) {
  const src = readFile(p);
  let m;
  while ((m = classInCSSRe.exec(src)) !== null) {
    definedClasses.add(m[1]);
  }
}

// ── STEP B : classes UTILISÉES dans le TSX ───────────────────────────────────

const TSX_EXCLUDES = ['components/brochure', 'node_modules', '.next', 'scripts'];
const tsxFiles = [
  ...walkSync(path.join(ROOT, 'app'), '.tsx', TSX_EXCLUDES),
  ...walkSync(path.join(ROOT, 'components'), '.tsx', TSX_EXCLUDES),
];

// préfixes à conserver (vocabulaire projet)
const KEEP_PREFIXES = [
  'crm','inv','mv','swarm','prospection','est','ct','page','card','kanban',
  'col','detail','kpi','hero','viz','funnel','donut','bar','field','form',
  'table','status','badge','chip','pill','nav','tab','rail','panel','shell',
  'chat','hitl','mission',
];

// Regex pour extraire classes statiques depuis className="..." et className={`...`}
// capture: className="foo bar baz" ou className={`foo bar`}
const classAttrRe = /className=(?:"([^"]*?)"|`([^`]*?)`|\{`([^`]*?)`\})/g;

// Regex pour détecter les interpolations dynamiques (à exclure)
const dynamicRe = /\$\{[^}]+\}/;

// Regex pour extraire chaque token de classe d'une chaîne statique
const tokenRe = /([a-zA-Z][\w-]*)/g;

// classes utilisées → Map<classe, Set<fichier>>
const usedClassFiles = new Map();

for (const p of tsxFiles) {
  const src = readFile(p);
  const rel = path.relative(ROOT, p);
  let m;
  while ((m = classAttrRe.exec(src)) !== null) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    // Découpe par espace/newline; pour chaque token, si pas dynamique → ajouter
    const segments = raw.split(/[\s\n]+/);
    for (const seg of segments) {
      if (!seg) continue;
      if (dynamicRe.test(seg)) continue; // interpolation dynamique → skip
      let t;
      const segRe = /([a-zA-Z][\w-]*)/g;
      while ((t = segRe.exec(seg)) !== null) {
        const cls = t[1];
        // filtre vocabulaire
        if (!KEEP_PREFIXES.some(pfx => cls.startsWith(pfx))) continue;
        if (!usedClassFiles.has(cls)) usedClassFiles.set(cls, new Set());
        usedClassFiles.get(cls).add(rel);
      }
    }
  }

  // Aussi capturer className={cn(...)} et className={clsx(...)} avec strings
  const cnRe = /(?:cn|clsx|cx)\(([^)]+)\)/g;
  let cn;
  while ((cn = cnRe.exec(src)) !== null) {
    const inner = cn[1];
    const strRe = /"([^"]+)"|'([^']+)'/g;
    let s;
    while ((s = strRe.exec(inner)) !== null) {
      const raw2 = s[1] ?? s[2];
      for (const cls of raw2.split(/\s+/)) {
        if (!cls) continue;
        if (!KEEP_PREFIXES.some(pfx => cls.startsWith(pfx))) continue;
        if (!usedClassFiles.has(cls)) usedClassFiles.set(cls, new Set());
        usedClassFiles.get(cls).add(rel);
      }
    }
  }
}

// ── STEP C : orphelines = utilisées ∧ jamais définies ────────────────────────

const orphans = [];
for (const [cls, files] of [...usedClassFiles.entries()].sort()) {
  if (!definedClasses.has(cls)) {
    orphans.push({ cls, files: [...files].sort() });
  }
}

// ── OUTPUT ────────────────────────────────────────────────────────────────────

console.log(`\n═══════════════════════════════════════════════════════════`);
console.log(`CLASSES DÉFINIES  : ${definedClasses.size}`);
console.log(`CLASSES UTILISÉES (vocab projet) : ${usedClassFiles.size}`);
console.log(`ORPHELINES (utilisées mais sans CSS) : ${orphans.length}`);
console.log(`═══════════════════════════════════════════════════════════\n`);

if (orphans.length === 0) {
  console.log('✅ Aucune classe orpheline détectée.');
} else {
  console.log('CLASSE ORPHELINE                      FICHIER(S)');
  console.log('─'.repeat(90));
  for (const { cls, files } of orphans) {
    const first = files[0];
    console.log(`  ${cls.padEnd(36)} ${first}`);
    for (let i = 1; i < files.length; i++) {
      console.log(`  ${''.padEnd(36)} ${files[i]}`);
    }
  }
}

// ── ALSO : liste consolidée pour le rapport ────────────────────────────────
const summary = orphans.map(o => o.cls);
console.log('\n\nLISTE CONSOLIDÉE (pour le rapport) :\n', JSON.stringify(summary, null, 2));
