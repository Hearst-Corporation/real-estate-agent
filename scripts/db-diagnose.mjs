#!/usr/bin/env node
// scripts/db-diagnose.mjs — Diagnostic du DB privé (Supabase self-hosté gpu1).
//
// Zéro dépendance : lit .env.local, interroge PostgREST via fetch avec la clé
// service-role, compare le schéma réel aux tables attendues des migrations
// 0018→0037, sonde la RPC verify_login, GoTrue et le comportement RLS anon vs
// service-role. Ne masque RIEN des résultats mais N'IMPRIME AUCUN secret.
//
// Usage : node scripts/db-diagnose.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Chargement .env.local (repo racine, gitignored) ──────────────────────────
function loadEnv() {
  // Le worktree isolé n'a pas de .env.local → fallback repo principal.
  const candidates = [
    resolve(ROOT, ".env.local"),
    "/Users/adrienbeyondcrypto/Dev/Projects/Real estate Agent/.env.local",
  ];
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
      return { env, path };
    } catch {
      /* try next */
    }
  }
  throw new Error("Aucun .env.local trouvé");
}

const { env, path: envPath } = loadEnv();
const URL_BASE = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const EXPECTED =
  `auth_audit_log auth_credentials cockpit_chats cockpit_messages estimation_messages estimations inv_approvals inv_audit_log inv_bond_register inv_bond_tranches inv_bondholder_mass inv_cap_table_entries inv_chain_events inv_deal_closing_conditions inv_deal_milestones inv_deals inv_deep_inscriptions inv_distribution_payouts inv_distributions inv_documents inv_escrow_movements inv_failed_operations inv_idempotency_keys inv_investor_assessments inv_investor_profiles inv_kiis_documents inv_kiis_versions inv_kyc_cases inv_operators inv_reconciliation_runs inv_regulatory_reports inv_reports inv_secondary_orders inv_signature_envelopes inv_spvs inv_subscriptions inv_tenants inv_token_mints inv_travel_rule_records inv_webhook_events leads mandates missions properties property_photos prosp_annonces prosp_config prosp_criteres_acquereur prosp_ingestion_runs prosp_match_feedback prosp_matchs prosp_prospects revoked_sessions sessions swarm_runs tenant_memory user_mfa users visits`
    .trim()
    .split(/\s+/);

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
  "swarm_runs",
  "tenant_memory",
];

function mask(s) {
  if (!s) return "(absent)";
  return `${s.slice(0, 4)}…[len ${s.length}]`;
}

async function http(path, { key, method = "GET", body, headers = {} } = {}) {
  const h = { ...headers };
  if (key) {
    h["apikey"] = key;
    h["Authorization"] = `Bearer ${key}`;
  }
  if (body) h["Content-Type"] = "application/json";
  try {
    const res = await fetch(`${URL_BASE}${path}`, {
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
  console.log(" DIAGNOSTIC DB PRIVÉ — Supabase self-hosté");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`env source        : ${envPath}`);
  console.log(`URL base          : ${URL_BASE}`);
  console.log(`service-role key  : ${mask(SERVICE_KEY)}`);
  console.log(`anon key          : ${mask(ANON_KEY)}`);
  console.log("");

  // ── 1. Ping PostgREST + récupération OpenAPI (liste des tables exposées) ────
  console.log("── 1. PostgREST OpenAPI (schéma public exposé) ─────────────────");
  const root = await http("/rest/v1/", { key: SERVICE_KEY });
  console.log(`GET /rest/v1/  →  HTTP ${root.status}`);
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
  console.log("── 2. Attendu (migrations 0018→0037) vs présent ───────────────");
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
    const r = await http(`/rest/v1/${t}?select=*&limit=1`, { key: SERVICE_KEY });
    console.log(
      `  ${t.padEnd(18)} openapi=${inSpec ? "oui" : "NON"}  service-role GET → HTTP ${r.status}` +
        (r.status >= 400 ? `  (${r.text.slice(0, 80)})` : ""),
    );
  }
  console.log("");

  // ── 4. RPC verify_login ─────────────────────────────────────────────────────
  console.log("── 4. RPC verify_login (auth self-host) ────────────────────────");
  const rpc = await http("/rest/v1/rpc/verify_login", {
    key: SERVICE_KEY,
    method: "POST",
    body: { p_email: "diagnostic-nonexistent@example.invalid", p_password: "x" },
  });
  console.log(`POST /rest/v1/rpc/verify_login  →  HTTP ${rpc.status}`);
  console.log(`  réponse : ${rpc.text.slice(0, 160)}`);
  const rpcExists = rpc.status !== 404 && !/could not find|does not exist|PGRST202/i.test(rpc.text);
  console.log(`  → verify_login ${rpcExists ? "PRÉSENTE" : "ABSENTE / introuvable"}`);
  console.log("");

  // ── 5. GoTrue présent ? ─────────────────────────────────────────────────────
  console.log("── 5. GoTrue / Auth Supabase natif ────────────────────────────");
  const gotrue = await http("/auth/v1/health");
  console.log(`GET /auth/v1/health  →  HTTP ${gotrue.status}`);
  console.log(`  réponse : ${gotrue.text.slice(0, 120)}`);
  console.log(`  → GoTrue ${gotrue.status === 200 ? "PRÉSENT" : "ABSENT"}`);
  console.log("");

  // ── 6. Storage / Realtime ───────────────────────────────────────────────────
  console.log("── 6. Storage / Realtime ──────────────────────────────────────");
  const storage = await http("/storage/v1/bucket", { key: SERVICE_KEY });
  console.log(`GET /storage/v1/bucket  →  HTTP ${storage.status}  (${storage.text.slice(0, 80)})`);
  const rt = await http("/realtime/v1/");
  console.log(`GET /realtime/v1/  →  HTTP ${rt.status}`);
  console.log("");

  // ── 7. RLS : anon vs service-role sur users & leads ─────────────────────────
  console.log("── 7. RLS anon vs service-role (users, leads) ─────────────────");
  for (const t of ["users", "leads"]) {
    const anon = await http(`/rest/v1/${t}?select=id&limit=1`, { key: ANON_KEY });
    const svc = await http(`/rest/v1/${t}?select=id&limit=1`, { key: SERVICE_KEY });
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
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(" FIN DIAGNOSTIC");
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("ERREUR FATALE :", e.message);
  process.exit(1);
});
