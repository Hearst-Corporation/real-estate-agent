// scripts/seed-crm.mjs
// Seed idempotent CRM — properties / leads / visits / mandates
// Usage : node scripts/seed-crm.mjs
// Requiert : .env.local à la racine du projet
//
// DB = Postgres self-hosté gpu1 exposé par PostgREST (aucun SDK tiers).
// Variables canoniques :
//   GPU1_POSTGREST_URL         base PostgREST (…/rest/v1)  [REQUIS]
//   GPU1_POSTGREST_ADMIN_TOKEN JWT service-role (bypass RLS) [REQUIS]
// Le token bypass la RLS → on filtre TOUJOURS explicitement user_id + tenant_id.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Parse .env.local ────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  // Cherche .env.local dans le worktree/script puis à la racine du repo (resolue
  // via git, jamais un chemin utilisateur en dur).
  const candidates = [
    process.env.REA_ENV_FILE,
    resolve(__dirname, "../.env.local"),
  ].filter(Boolean);
  for (const filePath of candidates) {
    let raw;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    const env = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      // Strip surrounding single or double quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
    return env;
  }
  return {};
}

const env = loadEnv();
const PGRST_BASE = (env.GPU1_POSTGREST_URL || "").replace(/\/$/, "");
const ADMIN_TOKEN = env.GPU1_POSTGREST_ADMIN_TOKEN;

if (!PGRST_BASE || !ADMIN_TOKEN) {
  console.error("❌  GPU1_POSTGREST_URL ou GPU1_POSTGREST_ADMIN_TOKEN absent dans .env.local");
  process.exit(1);
}

// ── Mini-client PostgREST (fetch, Bearer service-role) ───────────────────────
// Reproduit la surface du client GPU1 utilisée ici : from().select/insert
// (+ like/eq/limit, count exact head). Aucune dépendance externe.
function pgrst(base, token) {
  async function req(path, { method = "GET", body, count } = {}) {
    const headers = { Authorization: `Bearer ${token}` };
    if (body) headers["Content-Type"] = "application/json";
    const prefer = [];
    if (method === "POST") prefer.push("return=representation");
    if (count === "exact") prefer.push("count=exact");
    if (prefer.length) headers.Prefer = prefer.join(",");
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      return { data: null, count: null, error: { message: `HTTP ${res.status}: ${text.slice(0, 160)}` } };
    }
    const contentRange = res.headers.get("content-range"); // ex. "0-9/42"
    const total = contentRange?.includes("/") ? Number(contentRange.split("/")[1]) : null;
    let data = null;
    try {
      data = text ? JSON.parse(text) : [];
    } catch {
      data = [];
    }
    return { data, count: total, error: null };
  }

  return {
    from(table) {
      const filters = [];
      let cols = "*";
      let lim = null;
      let head = false;
      let countMode = null;
      const builder = {
        select(columns = "*", opts = {}) {
          cols = columns;
          if (opts.count) countMode = opts.count;
          if (opts.head) head = true;
          return builder;
        },
        like(field, pattern) {
          filters.push(`${field}=like.${encodeURIComponent(pattern)}`);
          return builder;
        },
        eq(field, value) {
          filters.push(`${field}=eq.${encodeURIComponent(value)}`);
          return builder;
        },
        limit(n) {
          lim = n;
          return builder;
        },
        insert(values) {
          const payload = Array.isArray(values) ? values : [values];
          const insertBuilder = {
            _cols: "*",
            select(columns = "*") {
              this._cols = columns;
              return this;
            },
            then(onF, onR) {
              const qs = `select=${encodeURIComponent(this._cols)}`;
              return req(`/${table}?${qs}`, { method: "POST", body: payload }).then(onF, onR);
            },
          };
          return insertBuilder;
        },
        then(onF, onR) {
          const params = [...filters];
          params.push(`select=${encodeURIComponent(cols)}`);
          if (lim != null) params.push(`limit=${lim}`);
          const qs = params.join("&");
          return req(`/${table}?${qs}`, {
            method: head ? "HEAD" : "GET",
            count: countMode,
          }).then(onF, onR);
        },
      };
      return builder;
    },
  };
}

const db = pgrst(PGRST_BASE, ADMIN_TOKEN);

const USER_ID = "9717aa27-d844-4221-ab2e-c277b93d77ca";
const TENANT_ID = "real-estate-agent";
const SENTINEL = "[SEED]";

// ── Idempotence par table ────────────────────────────────────────────────────
// Vérifie chaque groupe séparément — un run partiel (ex: properties ok, leads crashé)
// est repris proprement sans dupliquer ce qui existe déjà.

async function checkTableSeeded(table, field) {
  const { data, error } = await db
    .from(table)
    .select("id")
    .like(field, `${SENTINEL}%`)
    .limit(1);
  if (error) {
    console.error(`❌  Erreur vérification idempotence (${table}) :`, error.message);
    process.exit(1);
  }
  return data && data.length > 0;
}

const propertiesSeeded = await checkTableSeeded("properties", "title");
const leadsSeeded = await checkTableSeeded("leads", "full_name");

// Pour visits et mandates on vérifie sur le champ notes
const visitsSeeded = await checkTableSeeded("visits", "notes");
const mandatesSeeded = await checkTableSeeded("mandates", "notes");

const allSeeded = propertiesSeeded && leadsSeeded && visitsSeeded && mandatesSeeded;

if (allSeeded) {
  console.log("✅  Déjà seedé — aucun doublon inséré.");
  for (const table of ["properties", "leads", "visits", "mandates"]) {
    const { count } = await db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", TENANT_ID);
    console.log(`   ${table}: ${count} lignes`);
  }
  process.exit(0);
}

console.log("🌱  Insertion des données seed CRM…\n");

const now = new Date();

// ── INSERT properties ────────────────────────────────────────────────────────
let insertedProperties;

if (propertiesSeeded) {
  console.log("⏭   properties déjà seedées — skip insert");
  const { data } = await db
    .from("properties")
    .select("id, title")
    .like("title", `${SENTINEL}%`)
    .limit(3);
  insertedProperties = data;
} else {
  const propertiesData = [
    {
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      title: "[SEED] Appartement Haussmannien - Paris 8e",
      status: "mandat",
      property_type: "appartement",
      address: "42 avenue George V",
      city: "Paris",
      postal_code: "75008",
      surface: 145.5,
      rooms: 5,
      bedrooms: 3,
      asking_price: 2850000,
      estimated_value: 2790000,
      notes: "[SEED] Bel étage, vue dégagée, parquet d'origine. Bien en parfait état.",
    },
    {
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      title: "[SEED] Maison de ville - Lyon 6e",
      status: "en_vente",
      property_type: "maison",
      address: "18 rue Bossuet",
      city: "Lyon",
      postal_code: "69006",
      surface: 210,
      rooms: 7,
      bedrooms: 4,
      asking_price: 1250000,
      estimated_value: 1200000,
      notes: "[SEED] Maison de caractère avec jardin privatif 80m², cave voûtée.",
    },
    {
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      title: "[SEED] Studio neuf - Bordeaux Chartrons",
      status: "prospect",
      property_type: "studio",
      address: "7 quai des Chartrons",
      city: "Bordeaux",
      postal_code: "33000",
      surface: 28,
      rooms: 1,
      bedrooms: 0,
      asking_price: 195000,
      estimated_value: 190000,
      notes: "[SEED] Programme neuf livraison T4 2025. Balcon filant, vue Garonne.",
    },
  ];

  const { data, error: propErr } = await db
    .from("properties")
    .insert(propertiesData)
    .select("id, title");

  if (propErr) {
    console.error("❌  Erreur insert properties :", propErr.message);
    process.exit(1);
  }

  insertedProperties = data;
  console.log(`✔  properties insérées : ${insertedProperties.length}`);
  insertedProperties.forEach((p) => console.log(`     • ${p.id} — ${p.title}`));
}

const [prop1, prop2, prop3] = insertedProperties;

// ── INSERT leads ─────────────────────────────────────────────────────────────
let insertedLeads;

if (leadsSeeded) {
  console.log("⏭   leads déjà seedés — skip insert");
  const { data } = await db
    .from("leads")
    .select("id, full_name")
    .like("full_name", `${SENTINEL}%`)
    .limit(4);
  insertedLeads = data;
} else {
  const leadsData = [
    {
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      full_name: "[SEED] Sophie Marchand",
      status: "qualifie",
      kind: "acheteur",
      type_personne: "particulier",
      email: "sophie.marchand.seed@example.com",
      phone: "0612345678",
      source: "bouche_a_oreille",
      budget_min: 900000,
      budget_max: 1400000,
      property_id: prop2.id,
      notes: "[SEED] Cherche maison avec jardin pour famille de 4 personnes.",
    },
    {
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      full_name: "[SEED] Immobilier Investissements SA",
      status: "contacte",
      kind: "acheteur",
      type_personne: "professionnel",
      email: "contact.seed@immo-invest.example.com",
      phone: "0144556677",
      source: "site_web",
      budget_min: 2000000,
      budget_max: 5000000,
      property_id: prop1.id,
      notes: "[SEED] Société foncière cherche actifs premium Paris intra-muros.",
    },
    {
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      full_name: "[SEED] Thomas Bertrand",
      status: "nouveau",
      kind: "vendeur",
      type_personne: "particulier",
      email: "thomas.bertrand.seed@example.com",
      phone: "0698765432",
      source: "estimation_en_ligne",
      budget_min: null,
      budget_max: null,
      property_id: prop3.id,
      notes: "[SEED] Souhaite vendre son studio pour financer un projet en province.",
    },
    {
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      full_name: "[SEED] SCI Les Chartrons",
      status: "visite",
      kind: "acheteur",
      type_personne: "sci",
      email: "sci.chartrons.seed@example.com",
      phone: "0556778899",
      source: "agence_partenaire",
      budget_min: 150000,
      budget_max: 250000,
      property_id: prop3.id,
      notes: "[SEED] SCI patrimoniale cherche investissement locatif Bordeaux.",
    },
  ];

  const { data, error: leadErr } = await db
    .from("leads")
    .insert(leadsData)
    .select("id, full_name");

  if (leadErr) {
    console.error("❌  Erreur insert leads :", leadErr.message);
    process.exit(1);
  }

  insertedLeads = data;
  console.log(`✔  leads insérés : ${insertedLeads.length}`);
  insertedLeads.forEach((l) => console.log(`     • ${l.id} — ${l.full_name}`));
}

const [lead1, lead2] = insertedLeads;

// ── INSERT visits ────────────────────────────────────────────────────────────
if (visitsSeeded) {
  console.log("⏭   visits déjà seedées — skip insert");
} else {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const dayAfter = new Date(now);
  dayAfter.setDate(dayAfter.getDate() + 3);
  dayAfter.setHours(14, 30, 0, 0);

  const visitsData = [
    {
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      status: "confirmee",
      property_id: prop2.id,
      lead_id: lead1.id,
      scheduled_at: tomorrow.toISOString(),
      duration_min: 60,
      notes: "[SEED] Visite complète maison Lyon 6e avec Mme Marchand.",
    },
    {
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      status: "planifiee",
      property_id: prop1.id,
      lead_id: lead2.id,
      scheduled_at: dayAfter.toISOString(),
      duration_min: 45,
      notes: "[SEED] Visite appartement Paris 8e — représentant Immo Invest SA.",
    },
  ];

  const { data: insertedVisits, error: visitErr } = await db
    .from("visits")
    .insert(visitsData)
    .select("id, scheduled_at");

  if (visitErr) {
    console.error("❌  Erreur insert visits :", visitErr.message);
    process.exit(1);
  }

  console.log(`✔  visits insérées : ${insertedVisits.length}`);
  insertedVisits.forEach((v) =>
    console.log(`     • ${v.id} — ${new Date(v.scheduled_at).toLocaleString("fr-FR")}`)
  );
}

// ── INSERT mandates ──────────────────────────────────────────────────────────
if (mandatesSeeded) {
  console.log("⏭   mandates déjà seedés — skip insert");
} else {
  const signedAt = new Date(now);
  signedAt.setMonth(signedAt.getMonth() - 1);
  const expiresAt = new Date(signedAt);
  expiresAt.setMonth(expiresAt.getMonth() + 3);

  const signed2 = new Date(now);
  signed2.setDate(signed2.getDate() - 7);
  const expires2 = new Date(signed2);
  expires2.setMonth(expires2.getMonth() + 3);

  function toDateStr(d) {
    return d.toISOString().split("T")[0];
  }

  const mandatesData = [
    {
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      status: "actif",
      kind: "exclusif",
      property_id: prop1.id,
      reference: "SEED-MAN-2025-001",
      asking_price: 2850000,
      commission_pct: 3.5,
      signed_at: toDateStr(signedAt),
      expires_at: toDateStr(expiresAt),
      notes: "[SEED] Mandat exclusif Paris 8e — suivi prioritaire.",
    },
    {
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      status: "actif",
      kind: "simple",
      property_id: prop2.id,
      reference: "SEED-MAN-2025-002",
      asking_price: 1250000,
      commission_pct: 4.0,
      signed_at: toDateStr(signed2),
      expires_at: toDateStr(expires2),
      notes: "[SEED] Mandat simple maison Lyon 6e — en concurrence 2 agences.",
    },
  ];

  const { data: insertedMandates, error: mandErr } = await db
    .from("mandates")
    .insert(mandatesData)
    .select("id, reference");

  if (mandErr) {
    console.error("❌  Erreur insert mandates :", mandErr.message);
    process.exit(1);
  }

  console.log(`✔  mandates insérés : ${insertedMandates.length}`);
  insertedMandates.forEach((m) => console.log(`     • ${m.id} — ${m.reference}`));
}

// ── Récap counts ─────────────────────────────────────────────────────────────
console.log("\n── Récap counts (tenant: real-estate-agent) ──");
for (const table of ["properties", "leads", "visits", "mandates"]) {
  const { count, error: cntErr } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT_ID);
  if (cntErr) {
    console.warn(`   ${table}: erreur count — ${cntErr.message}`);
  } else {
    console.log(`   ${table}: ${count} lignes`);
  }
}

console.log("\n✅  Seed terminé avec succès.");
process.exit(0);
