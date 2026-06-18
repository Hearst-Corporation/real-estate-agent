/**
 * CLI d'estimation standalone — exécute le VRAI pipeline de valorisation
 * (le même que app/api/estimations/[id]/value/route.ts) sans Supabase/auth.
 *
 *   scrape (DVF Etalab + BAN + cadastre IGN + ADEME) → comparables → report → prix
 *
 * Usage :
 *   pnpm dlx tsx scripts/estimate-cli.ts '{"adresse":"20 avenue de l Opera","ville":"Paris","code_postal":"75001","type_bien":"appartement","surface_habitable_m2":75,"nombre_pieces":3}'
 *
 * Sans argument → bien de démonstration (Paris 1er, T3 75 m²).
 */

import { geocode } from '../lib/estimation/geocode';
import { resolveParcelle } from '../lib/estimation/cadastre';
import { candidateSections } from '../lib/estimation/sections';
import { fetchMutationsMultiSection } from '../lib/estimation/dvf';
import { buildComparables } from '../lib/estimation/comparables';
import { fetchDpeForAddress } from '../lib/estimation/ademe';
import { computeValuation } from '../lib/estimation/valuation';
import { fetchListingComparables } from '../lib/estimation/listings';
import type { PropertyData } from '../lib/estimation/types';

const eur = (n: number) => n.toLocaleString('fr-FR') + ' €';
const line = (c = '─') => console.log(c.repeat(64));

function baseProperty(): PropertyData {
  return {
    type_bien: 'appartement',
    adresse: null, ville: null, code_postal: null, secteur: null,
    surface_habitable_m2: null, surface_carrez_m2: null, surface_carrez_confirmee: null,
    nombre_pieces: null, nombre_chambres: null, etage: null, nb_etages_total: null,
    ascenseur: null, vue: null, exposition: null, luminosite: null,
    hauteur_sous_plafond_m: null, stationnement: null, nb_stationnements: null,
    cave: null, cave_surface_m2: null, terrasse_balcon_m2: null, jardin_m2: null,
    etat_general: null, annee_renovation: null, qualite_renovation: null,
    meuble: null, meuble_inclus: null, dpe_classe: null, ges_classe: null,
    annee_dpe: null, etat_copropriete: null, nombre_lots: null,
    charges_annuelles_eur: null, travaux_votes: null, standing_style: null,
    prestations: [], nuisances: null, motif_vente: null, delai_souhaite: null,
    occupation: null, loyer_mensuel_eur: null, commentaires: null,
  };
}

const DEMO: Partial<PropertyData> = {
  type_bien: 'appartement',
  adresse: '20 avenue de l’Opéra',
  ville: 'Paris', code_postal: '75001',
  surface_habitable_m2: 75, nombre_pieces: 3, etage: 4, ascenseur: true,
  exposition: 'sud', etat_general: 'bon', dpe_classe: 'D', cave: true,
};

async function main() {
  const arg = process.argv[2];
  const override: Partial<PropertyData> = arg ? JSON.parse(arg) : DEMO;
  const property: PropertyData = { ...baseProperty(), ...override };

  const adresse = [property.adresse, property.ville, property.code_postal]
    .filter(Boolean).join(', ');

  line('═');
  console.log('  ESTIMATION —', adresse);
  console.log('  ' + [
    property.type_bien,
    property.surface_habitable_m2 ? property.surface_habitable_m2 + ' m²' : null,
    property.nombre_pieces ? property.nombre_pieces + ' pièces' : null,
  ].filter(Boolean).join(' · '));
  line('═');

  // 1. Geocode (BAN -> IGN failover)
  process.stdout.write('→ Géocodage (BAN)… ');
  const geo = await geocode(adresse);
  if (!geo) { console.log('❌ adresse introuvable — estimation impossible'); return; }
  console.log(`OK  ${geo.lat.toFixed(5)},${geo.lon.toFixed(5)}  INSEE ${geo.inseeCode}  (score ${geo.score.toFixed(2)})`);

  // 2. Cadastre (parcelle/section)
  process.stdout.write('→ Cadastre (IGN)… ');
  const parcelle = await resolveParcelle(geo.lat, geo.lon);
  console.log(parcelle ? `section ${parcelle.section} n°${parcelle.numero}` : 'parcelle non résolue (ok, bbox)');

  // 3. DVF scrape (transactions réelles)
  process.stdout.write('→ Sections candidates… ');
  const sections = await candidateSections(geo.lat, geo.lon, parcelle?.section);
  console.log(sections.join(', ') || '(aucune)');
  process.stdout.write('→ DVF Etalab scrape… ');
  const mutations = await fetchMutationsMultiSection(geo.inseeCode, sections);
  console.log(`${mutations.length} mutations brutes`);

  // 4. Comparables
  const { comparables, medianPricePerSqm, nbComparables, confidence } = buildComparables(
    {
      type_bien: property.type_bien,
      nombre_pieces: property.nombre_pieces,
      surface: property.surface_habitable_m2 ?? property.surface_carrez_m2,
      lat: geo.lat, lon: geo.lon,
    },
    mutations,
  );
  console.log(`→ Comparables retenus : ${nbComparables}  ·  médiane ${medianPricePerSqm ? Math.round(medianPricePerSqm) + ' €/m²' : 'n/a'}  ·  confiance ${confidence}`);

  // 5. DPE ADEME (best-effort)
  let dpe = property.dpe_classe;
  if (!dpe) {
    process.stdout.write('→ DPE ADEME… ');
    const r = await fetchDpeForAddress(adresse);
    dpe = (r.classe as PropertyData['dpe_classe']) ?? null;
    console.log(dpe ?? 'inconnu');
  }
  const propertyForValuation: PropertyData = dpe ? { ...property, dpe_classe: dpe } : property;

  // 6. Valorisation (fonction pure)
  const v = computeValuation(propertyForValuation, comparables, {
    medianPricePerSqm, confidence, compDpeMix: null,
  });

  // 7. Annonces live (best-effort, [] si non configuré)
  process.stdout.write('→ Annonces en cours… ');
  const listings = await fetchListingComparables({
    ville: property.ville, codePostal: property.code_postal,
    typeBien: property.type_bien,
    surface: property.surface_habitable_m2 ?? property.surface_carrez_m2 ?? null,
    nbPieces: property.nombre_pieces,
  });
  console.log(`${listings.listings.length} annonce(s) (source: ${listings.source ?? 'aucune'})`);

  // ── REPORT ────────────────────────────────────────────────────────────
  console.log('');
  line();
  console.log('  RAPPORT');
  line();
  console.log(`  Zone                : ${geo.city} (${geo.inseeCode})`);
  console.log(`  Prix m² médian (DVF) : ${medianPricePerSqm ? Math.round(medianPricePerSqm) + ' €/m²' : 'n/a'}`);
  console.log(`  Base retenue        : ${v.basePerM2 ? v.basePerM2 + ' €/m²' : 'n/a'}`);
  console.log(`  Prix m² ajusté      : ${v.adjustedPerM2 ? v.adjustedPerM2 + ' €/m²' : 'n/a'}`);
  console.log(`  Comparables DVF     : ${v.nbComparables}   Confiance : ${v.confidence}`);
  if (v.adjustments.length) {
    console.log('  Ajustements :');
    for (const a of v.adjustments) {
      const sign = a.pct > 0 ? '+' : '';
      console.log(`    • ${a.label.padEnd(34)} ${sign}${a.pct}%`);
    }
  }
  console.log('');
  line();
  console.log('  PRIX');
  line();
  console.log(`  Fourchette basse    : ${eur(v.lowValue)}`);
  console.log(`  ★ VALEUR DE MARCHÉ   : ${eur(v.marketValue)}`);
  console.log(`  Fourchette haute    : ${eur(v.highValue)}`);
  console.log(`  Prix annonce conseil: ${eur(v.recommendedListingPrice)}`);
  line('═');
}

main().catch((e) => { console.error('PIPELINE ERROR:', e); process.exit(1); });
