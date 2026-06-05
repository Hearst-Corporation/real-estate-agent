// scripts/seed-crm.mjs
// Seed idempotent CRM — properties / leads / visits / mandates
// Usage : node scripts/seed-crm.mjs
// Requiert : .env.local à la racine du projet

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Parse .env.local ────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

function loadEnv(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    // Fallback : cherche .env.local dans la racine réelle du projet
    const fallback = resolve(
      "/Users/adrienbeyondcrypto/Dev/Projects/Real estate Agent/.env.local"
    );
    raw = readFileSync(fallback, "utf8");
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

const env = loadEnv(envPath);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY absent dans .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const USER_ID = "9717aa27-d844-4221-ab2e-c277b93d77ca";
const TENANT_ID = "real-estate-agent";
const SENTINEL = "[SEED]";

// ── Idempotence ──────────────────────────────────────────────────────────────
const { data: existing, error: checkErr } = await supabase
  .from("properties")
  .select("id")
  .like("title", `${SENTINEL}%`)
  .limit(1);

if (checkErr) {
  console.error("❌  Erreur vérification idempotence :", checkErr.message);
  process.exit(1);
}

if (existing && existing.length > 0) {
  console.log("✅  Déjà seedé — aucun doublon inséré.");

  // Log counts quand même
  for (const table of ["properties", "leads", "visits", "mandates"]) {
    const { count } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", TENANT_ID);
    console.log(`   ${table}: ${count} lignes`);
  }
  process.exit(0);
}

// ── INSERT properties ────────────────────────────────────────────────────────
console.log("🌱  Insertion des données seed CRM…\n");

const now = new Date();

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
    notes: "Bel étage, vue dégagée, parquet d'origine. Bien en parfait état.",
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
    notes: "Maison de caractère avec jardin privatif 80m², cave voûtée.",
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
    notes: "Programme neuf livraison T4 2025. Balcon filant, vue Garonne.",
  },
];

const { data: insertedProperties, error: propErr } = await supabase
  .from("properties")
  .insert(propertiesData)
  .select("id, title");

if (propErr) {
  console.error("❌  Erreur insert properties :", propErr.message);
  process.exit(1);
}

const [prop1, prop2, prop3] = insertedProperties;
console.log(`✔  properties insérées : ${insertedProperties.length}`);
insertedProperties.forEach((p) => console.log(`     • ${p.id} — ${p.title}`));

// ── INSERT leads ─────────────────────────────────────────────────────────────

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
    notes: "Cherche maison avec jardin pour famille de 4 personnes.",
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
    notes: "Société foncière cherche actifs premium Paris intra-muros.",
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
    notes: "Souhaite vendre son studio pour financer un projet en province.",
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
    notes: "SCI patrimoniale cherche investissement locatif Bordeaux.",
  },
];

const { data: insertedLeads, error: leadErr } = await supabase
  .from("leads")
  .insert(leadsData)
  .select("id, full_name");

if (leadErr) {
  console.error("❌  Erreur insert leads :", leadErr.message);
  process.exit(1);
}

const [lead1, lead2] = insertedLeads;
console.log(`✔  leads insérés : ${insertedLeads.length}`);
insertedLeads.forEach((l) => console.log(`     • ${l.id} — ${l.full_name}`));

// ── INSERT visits ────────────────────────────────────────────────────────────

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

const { data: insertedVisits, error: visitErr } = await supabase
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

// ── INSERT mandates ──────────────────────────────────────────────────────────

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

const { data: insertedMandates, error: mandErr } = await supabase
  .from("mandates")
  .insert(mandatesData)
  .select("id, reference");

if (mandErr) {
  console.error("❌  Erreur insert mandates :", mandErr.message);
  process.exit(1);
}

console.log(`✔  mandates insérés : ${insertedMandates.length}`);
insertedMandates.forEach((m) => console.log(`     • ${m.id} — ${m.reference}`));

// ── Récap counts ─────────────────────────────────────────────────────────────
console.log("\n── Récap counts (tenant: real-estate-agent) ──");
for (const table of ["properties", "leads", "visits", "mandates"]) {
  const { count, error: cntErr } = await supabase
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
