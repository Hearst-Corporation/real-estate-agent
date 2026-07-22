#!/usr/bin/env node
// scripts/db-diagnose.mjs — Diagnostic du DB privé (Postgres self-hosté gpu1, PostgREST).
//
// Zéro dépendance : lit .env.local, interroge PostgREST via fetch avec le token
// admin (service-role, bypass RLS), compare le schéma réel aux tables créées par
// toutes les migrations versionnées jusqu'à 0048, sonde la RPC verify_login,
// vérifie que le montage est bien PostgREST-only (aucun service d'auth/storage/
// realtime exposé) et le comportement RLS anon vs service-role. Ne masque RIEN mais
// N'IMPRIME AUCUN secret.
//
// Variables canoniques (post-migration GPU1) :
//   GPU1_POSTGREST_URL         base PostgREST, ex. https://…/rest/v1  [REQUIS]
//   GPU1_POSTGREST_ADMIN_TOKEN JWT service-role (bypass RLS)          [REQUIS]
//   GPU1_POSTGREST_ANON_TOKEN  JWT anon (probe RLS)                   [OPTIONNEL]
//
// Usage : node scripts/db-diagnose.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Chargement .env.local (repo racine, gitignored) ──────────────────────────
function loadEnv() {
  const candidates = [process.env.REA_ENV_FILE, resolve(ROOT, ".env.local")].filter(Boolean);
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, "utf8");
      const env = {};
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
          v = v.slice(1, -1);
        env[m[1]] = v;
      }
      return { env: { ...env, ...process.env }, path };
    } catch {
      /* try next */
    }
  }
  if (process.env.GPU1_POSTGREST_ADMIN_TOKEN) return { env: process.env, path: "process.env" };
  throw new Error("Aucun .env.local trouvé");
}

const { env, path: envPath } = loadEnv();
// GPU1_POSTGREST_URL inclut déjà `/rest/v1` (cf. .env.example). On dérive :
//   PGRST_BASE : racine PostgREST (…/rest/v1) — tables + RPC
//   HOST_BASE  : racine du domaine — probes auth/storage/realtime (attendus ABSENTS)
const PGRST_BASE = (env.GPU1_POSTGREST_URL || "").replace(/\/$/, "");
const HOST_BASE = PGRST_BASE.replace(/\/rest\/v1$/, "");
const SERVICE_KEY = env.GPU1_POSTGREST_ADMIN_TOKEN || "";
const ANON_KEY = env.GPU1_POSTGREST_ANON_TOKEN || "";

function expectedTablesFromMigrations() {
  const directory = resolve(ROOT, "supabase", "migrations");
  const tables = new Set();
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(resolve(directory, file), "utf8")
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?:public|auth)\.)?"?([a-z_][a-z0-9_]*)"?/gi,
    )) {
      tables.add(match[1].toLowerCase());
    }
  }
  return [...tables].sort();
}

const EXPECTED = expectedTablesFromMigrations();

const CRITICAL = [
  "users",
  "sessions",
  "leads",
  "mandates",
  "properties",
  "visits",
  "revoked_sessions",
  "user_mfa",
  "auth_audit_log",
  "tenant_memory",
  "rea_tasks",
  "agent_gateway_idempotency_keys",
  "agent_gateway_audit_log",
  "agent_alert_approvals",
];

const RELEASE_OBJECTS = [
  "rea_tasks",
  "agent_gateway_idempotency_keys",
  "agent_gateway_audit_log",
  "agent_alert_approvals",
];

function mask(s) {
  if (!s) return "(absent)";
  return `${s.slice(0, 4)}…[len ${s.length}]`;
}

// PostgREST self-host gpu1 : authentification par Bearer uniquement (aucune entête
// `apikey` — ce montage n'a pas de passerelle BaaS devant). `base` permet de viser
// la racine PostgREST (défaut) ou la racine du domaine (probes d'absence).
async function http(path, { key, method = "GET", body, headers = {}, base = PGRST_BASE } = {}) {
  const h = { ...headers };
  if (key) {
    h.Authorization = `Bearer ${key}`;
  }
  if (body) h["Content-Type"] = "application/json";
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: h,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } catch (e) {
    return { status: 0, ok: false, text: `FETCH_ERROR: ${e.message}` };
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(" DIAGNOSTIC DB PRIVÉ — Postgres self-hosté gpu1 (PostgREST)");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`env source        : ${envPath}`);
  console.log(`PostgREST base    : ${PGRST_BASE}`);
  console.log(`admin token       : ${mask(SERVICE_KEY)}`);
  console.log(`anon token        : ${mask(ANON_KEY)}`);
  console.log("");

  // ── 1. Ping PostgREST + récupération OpenAPI (liste des tables exposées) ────
  console.log("── 1. PostgREST OpenAPI (schéma public exposé) ─────────────────");
  const root = await http("/", { key: SERVICE_KEY });
  console.log(`GET ${PGRST_BASE}/  →  HTTP ${root.status}`);
  let presentTables = [];
  if (root.ok) {
    try {
      const spec = JSON.parse(root.text);
      // OpenAPI v2 : definitions = tables + vues exposées.
      presentTables = Object.keys(spec.definitions || spec.components?.schemas || {}).sort();
    } catch (e) {
      console.log(`  ⚠ parse OpenAPI échoué : ${e.message}`);
    }
  }
  // Fallback : introspection via une RPC SQL si elle existe (non garanti).
  console.log(`Tables/vues exposées via PostgREST : ${presentTables.length}`);
  if (presentTables.length) console.log(`  ${presentTables.join(", ")}`);
  console.log("");

  // ── 2. Comparaison attendu vs présent ──────────────────────────────────────
  console.log("── 2. Attendu (toutes migrations versionnées → 0048) vs présent ─");
  const presentSet = new Set(presentTables);
  const missing = EXPECTED.filter((t) => !presentSet.has(t));
  const extra = presentTables.filter(
    (t) => !EXPECTED.includes(t) && !t.startsWith("(") && t !== "rpc",
  );
  console.log(`Attendues : ${EXPECTED.length}`);
  console.log(`Présentes : ${presentTables.length}`);
  console.log(`MANQUANTES (${missing.length}) : ${missing.join(", ") || "aucune"}`);
  console.log(`EN TROP / non-migrées (${extra.length}) : ${extra.join(", ") || "aucune"}`);
  console.log("");

  // ── 3. Tables critiques : présence + accès service-role ─────────────────────
  console.log("── 3. Tables critiques (présence + lecture service-role) ──────");
  for (const t of CRITICAL) {
    const inSpec = presentSet.has(t);
    const r = await http(`/${t}?select=*&limit=1`, { key: SERVICE_KEY });
    console.log(
      `  ${t.padEnd(18)} openapi=${inSpec ? "oui" : "NON"}  service-role GET → HTTP ${r.status}` +
        (r.status >= 400 ? `  (${r.text.slice(0, 80)})` : ""),
    );
  }
  console.log("");

  // ── 4. RPC verify_login ─────────────────────────────────────────────────────
  console.log("── 4. RPC verify_login (auth self-host) ────────────────────────");
  const rpc = await http("/rpc/verify_login", {
    key: SERVICE_KEY,
    method: "POST",
    body: { p_email: "diagnostic-nonexistent@example.invalid", p_password: "x" },
  });
  console.log(`POST ${PGRST_BASE}/rpc/verify_login  →  HTTP ${rpc.status}`);
  console.log(`  réponse : ${rpc.text.slice(0, 160)}`);
  const rpcExists = rpc.status !== 404 && !/could not find|does not exist|PGRST202/i.test(rpc.text);
  console.log(`  → verify_login ${rpcExists ? "PRÉSENTE" : "ABSENTE / introuvable"}`);
  console.log("");

  // ── 5. Service d’auth exposé ? (attendu ABSENT sur montage PostgREST-only) ──
  // Garde-fou de régression : le montage gpu1 ne doit exposer AUCUN service
  // d’auth hébergé — l’auth passe exclusivement par la RPC `verify_login`.
  console.log("── 5. Service d’auth exposé (attendu ABSENT — auth = verify_login) ─");
  const authProbe = await http("/auth/v1/health", { base: HOST_BASE });
  console.log(`GET /auth/v1/health  →  HTTP ${authProbe.status}`);
  console.log(`  réponse : ${authProbe.text.slice(0, 120)}`);
  console.log(`  → service d’auth ${authProbe.status === 200 ? "PRÉSENT (inattendu)" : "ABSENT (attendu)"}`);
  console.log("");

  // ── 6. Storage / Realtime (attendus ABSENTS — storage = Cloudflare R2) ──────
  console.log("── 6. Storage / Realtime (attendus ABSENTS) ───────────────────");
  const storage = await http("/storage/v1/bucket", { key: SERVICE_KEY, base: HOST_BASE });
  console.log(`GET /storage/v1/bucket  →  HTTP ${storage.status}  (${storage.text.slice(0, 80)})`);
  const rt = await http("/realtime/v1/", { base: HOST_BASE });
  console.log(`GET /realtime/v1/  →  HTTP ${rt.status}`);
  console.log("");

  // ── 7. RLS : anon vs service-role sans afficher aucune ligne ────────────────
  console.log("── 7. RLS anon vs service-role (objets critiques/release) ─────");
  for (const t of ["users", "leads", ...RELEASE_OBJECTS]) {
    const anon = await http(`/${t}?select=id&limit=1`, { key: ANON_KEY });
    const svc = await http(`/${t}?select=id&limit=1`, { key: SERVICE_KEY });
    let anonRows = "?";
    try {
      anonRows = String(JSON.parse(anon.text).length);
    } catch {
      anonRows = "n/a";
    }
    let svcRows = "?";
    try {
      svcRows = String(JSON.parse(svc.text).length);
    } catch {
      svcRows = "n/a";
    }
    console.log(
      `  ${t.padEnd(8)} anon → HTTP ${anon.status} (rows=${anonRows}) | service-role → HTTP ${svc.status} (rows=${svcRows})`,
    );
    if (anon.status < 400 && anonRows !== "0" && anonRows !== "n/a")
      console.log(`    ⚠ anon lit des lignes de ${t} → RLS potentiellement TROP OUVERTE`);
  }
  console.log("");

  console.log("── 8. Ledger release 0043→0048 (présence PostgREST) ───────────");
  for (const table of RELEASE_OBJECTS) {
    console.log(`  ${table.padEnd(38)} ${presentSet.has(table) ? "PRÉSENTE" : "ABSENTE / NON PROUVÉE"}`);
  }
  console.log("  Note : indexes, triggers et policies exigent l'introspection psql read-only documentée dans docs/DEPLOYMENT.md.");
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(" FIN DIAGNOSTIC");
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("ERREUR FATALE :", e.message);
  process.exit(1);
});
