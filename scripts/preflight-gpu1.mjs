#!/usr/bin/env node
/**
 * preflight-gpu1 — Plan d'activation GPU1 des migrations 0049+.
 *
 * LISTE, DANS L'ORDRE, les migrations à appliquer sur la base gpu1 (Postgres
 * self-hosté `nexus-postgres`, base `real-estate-agent`, exposée par PostgREST
 * `real-estate-agent-postgrest`). Pour CHAQUE migration : la commande exacte
 * d'application (`ssh gpu1 'docker exec -i …' < fichier`) + le reload de cache
 * PostgREST (`SIGUSR1`).
 *
 * ⚠️ N'APPLIQUE RIEN. Aucun réseau. Aucune écriture GPU1. Lecture de fichiers
 * locaux uniquement. C'est un GÉNÉRATEUR DE PLAN, à exécuter à la main lors de
 * l'intégration/QA (cf. docs/gpu1-activation-008.md).
 *
 * Classe chaque migration en :
 *   ATTENDUE   — une table/colonne qu'elle crée est référencée par le code
 *                (lib/** ou app/**) → la feature DÉGRADE en UNAVAILABLE tant
 *                qu'elle n'est pas appliquée. À appliquer pour activer la vague.
 *   OPTIONNELLE — aucune référence code (cache/réservé) → application différable
 *                sans dégrader le runtime.
 *
 * Usage :
 *   node scripts/preflight-gpu1.mjs            # plan complet 0049+
 *   node scripts/preflight-gpu1.mjs --expected # uniquement les ATTENDUES
 *   node scripts/preflight-gpu1.mjs --sh       # émet un script shell copiable
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MIG = join(ROOT, "supabase", "migrations");

// Seuil : on ne planifie QUE les migrations de la vague d'activation (>= 0049).
const FROM = 49;

const CONTAINER_PG = "nexus-postgres";
const DB = "real-estate-agent";
const CONTAINER_PGRST = "real-estate-agent-postgrest";

const argExpectedOnly = process.argv.includes("--expected");
const argSh = process.argv.includes("--sh");

// ── Objets créés par chaque migration (tables) → pour tester la référence code ─
function createdObjects(sql) {
  const stripped = sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
  const tables = [
    ...stripped.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi),
  ].map((m) => m[1].toLowerCase());
  // 0049 ne crée pas de table (altère agent_alert_approvals + colonnes) → on
  // détecte aussi la table altérée pour tester la référence code.
  const altered = [
    ...stripped.matchAll(/alter\s+table\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi),
  ].map((m) => m[1].toLowerCase());
  return { tables: [...new Set(tables)], altered: [...new Set(altered)] };
}

// ── Le code référence-t-il une de ces tables ? (grep local, sans réseau) ───────
function codeReferences(names) {
  const roots = ["lib", "app"].map((d) => join(ROOT, d)).filter(existsSync);
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
        const content = readFileSync(full, "utf8");
        for (const name of names) {
          // Cherche le nom de table entre quotes (usage .from("x") / "x").
          if (new RegExp(`["'\`]${name}["'\`]`).test(content)) {
            hits.push(name);
            break;
          }
        }
      }
    }
  };
  for (const r of roots) walk(r);
  return [...new Set(hits)];
}

// ── Inventaire des migrations >= FROM ──────────────────────────────────────────
const files = readdirSync(MIG)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .filter((f) => Number(f.slice(0, 4)) >= FROM)
  .sort((a, b) => a.localeCompare(b));

const plan = files.map((file) => {
  const sql = readFileSync(join(MIG, file), "utf8");
  const { tables, altered } = createdObjects(sql);
  // Table pertinente pour la référence code : tables créées, sinon table altérée.
  const probe = tables.length ? tables : altered;
  const refs = codeReferences(probe);
  const expected = refs.length > 0;
  return { file, n: file.slice(0, 4), tables, altered, refs, expected };
});

const applyCmd = (file) =>
  `ssh gpu1 'docker exec -i ${CONTAINER_PG} psql -U postgres -d ${DB}' < supabase/migrations/${file}`;
const reloadCmd = `ssh gpu1 'docker kill -s SIGUSR1 ${CONTAINER_PGRST}'`;

// ── Sortie script shell copiable ───────────────────────────────────────────────
if (argSh) {
  const list = argExpectedOnly ? plan.filter((p) => p.expected) : plan;
  console.log("#!/usr/bin/env bash");
  console.log("# GÉNÉRÉ par preflight-gpu1.mjs — À EXÉCUTER À LA MAIN lors de l'intégration/QA.");
  console.log("# NE PAS lancer depuis un worker (interdit d'appliquer sur gpu1).");
  console.log("set -euo pipefail");
  console.log(`cd "$(git rev-parse --show-toplevel)"`);
  for (const p of list) {
    console.log(`\n# ${p.n} — ${p.expected ? "ATTENDUE" : "OPTIONNELLE"}${p.tables.length ? " (" + p.tables.join(", ") + ")" : ""}`);
    console.log(applyCmd(p.file));
  }
  console.log(`\n# Reload du cache PostgREST APRÈS le DDL (obligatoire).`);
  console.log(reloadCmd);
  process.exit(0);
}

// ── Sortie plan lisible ────────────────────────────────────────────────────────
console.log("\n═══ PRÉFLIGHT GPU1 — plan d'activation des migrations 0049+ ═══");
console.log("⚠️  LECTURE SEULE. Rien n'est appliqué, aucun réseau. Plan à exécuter à la main (QA).\n");
console.log(`Base    : ${DB} (conteneur ${CONTAINER_PG})`);
console.log(`PostgREST : ${CONTAINER_PGRST} (reload SIGUSR1 après DDL)\n`);

const expected = plan.filter((p) => p.expected);
const optional = plan.filter((p) => !p.expected);
const list = argExpectedOnly ? expected : plan;

console.log(`Migrations >= 0049 : ${plan.length} au total — ${expected.length} ATTENDUES, ${optional.length} OPTIONNELLES.\n`);

let step = 0;
for (const p of list) {
  step += 1;
  const tag = p.expected ? "ATTENDUE   " : "OPTIONNELLE";
  const objs = p.tables.length ? p.tables.join(", ") : `alter ${p.altered.join(", ")}`;
  console.log(`[${String(step).padStart(2, "0")}] ${p.n}  ${tag}  ${p.file}`);
  console.log(`     objets  : ${objs}`);
  if (p.expected) console.log(`     réf code : ${p.refs.join(", ")}`);
  else console.log(`     réf code : aucune (cache/réservé → application différable)`);
  console.log(`     apply   : ${applyCmd(p.file)}`);
  console.log("");
}

console.log("Après TOUTES les migrations appliquées, recharger le cache PostgREST :");
console.log(`     ${reloadCmd}\n`);

console.log("Résumé ordre d'application (ATTENDUES d'abord recommandé, l'ordre numérique reste valide) :");
console.log("  ATTENDUES   : " + (expected.map((p) => p.n).join(" → ") || "aucune"));
console.log("  OPTIONNELLES : " + (optional.map((p) => p.n).join(" → ") || "aucune"));
console.log("\nProcédure complète + rollback : docs/gpu1-activation-008.md");
console.log("Astuce : `node scripts/preflight-gpu1.mjs --sh > /tmp/apply.sh` pour un script copiable.\n");

// Ce script ne fait AUCUNE écriture ; sort toujours 0 (c'est un plan, pas une gate).
process.exit(0);
