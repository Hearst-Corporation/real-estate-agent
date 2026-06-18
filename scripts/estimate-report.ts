/**
 * Génère le VRAI report d'estimation de l'app (brochure designée A4) en standalone.
 * Pipeline complet : scrape DVF + cadastre + ADEME + annonces (Apify) → valuation
 * → assemble Estimation → renderBrochureHtml → PDF chromium + PNG preview.
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/estimate-report.ts '<json property>'
 *
 * Sorties : out/report.html, out/report.pdf, out/report.png
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { geocode } from '@/lib/estimation/geocode';
import { resolveParcelle } from '@/lib/estimation/cadastre';
import { candidateSections } from '@/lib/estimation/sections';
import { fetchMutationsMultiSection } from '@/lib/estimation/dvf';
import { buildComparables } from '@/lib/estimation/comparables';
import { fetchDpeForAddress } from '@/lib/estimation/ademe';
import { computeValuation } from '@/lib/estimation/valuation';
import { fetchListingComparables } from '@/lib/estimation/listings';
import { renderBrochureHtml } from '@/lib/brochure/render-html';
import { renderEstimationPdf } from '@/lib/brochure/pdf';
import type { PropertyData, Estimation, MarketAnalysis } from '@/lib/estimation/types';

function baseProperty(): PropertyData {
  return {
    type_bien: 'maison',
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

async function main() {
  const arg = process.argv[2];
  const override: Partial<PropertyData> = arg ? JSON.parse(arg) : {};
  const property: PropertyData = { ...baseProperty(), ...override };

  const adresse = [property.adresse, property.ville, property.code_postal].filter(Boolean).join(', ');
  console.log('▶ Report pour :', adresse, '|', property.surface_habitable_m2, 'm²');

  // ── Pipeline (identique à app/api/estimations/[id]/value) ────────────────
  const geo = await geocode(adresse);
  if (!geo) throw new Error('géocodage échoué');
  console.log('  geo OK', geo.inseeCode);
  const parcelle = await resolveParcelle(geo.lat, geo.lon);
  const sections = await candidateSections(geo.lat, geo.lon, parcelle?.section);
  const mutations = await fetchMutationsMultiSection(geo.inseeCode, sections);
  console.log('  DVF', mutations.length, 'mutations');

  const { comparables, medianPricePerSqm, nbComparables, confidence } = buildComparables(
    {
      type_bien: property.type_bien, nombre_pieces: property.nombre_pieces,
      surface: property.surface_habitable_m2 ?? property.surface_carrez_m2,
      lat: geo.lat, lon: geo.lon,
    },
    mutations,
  );
  console.log('  comparables', nbComparables, 'médiane', medianPricePerSqm);

  let dpe = property.dpe_classe;
  if (!dpe) { const r = await fetchDpeForAddress(adresse); dpe = (r.classe as PropertyData['dpe_classe']) ?? null; }
  const propertyForValuation: PropertyData = dpe ? { ...property, dpe_classe: dpe } : property;

  const valuation = computeValuation(propertyForValuation, comparables, { medianPricePerSqm, confidence, compDpeMix: null });
  console.log('  valeur de marché', valuation.marketValue, '€');

  const listingResult = await fetchListingComparables({
    ville: property.ville, codePostal: property.code_postal, typeBien: property.type_bien,
    surface: property.surface_habitable_m2 ?? property.surface_carrez_m2 ?? null, nbPieces: property.nombre_pieces,
  });
  console.log('  annonces', listingResult.listings.length, '(', listingResult.source, ')');

  const now = new Date().toISOString();
  const market: MarketAnalysis = {
    zone: `${geo.city} (${geo.inseeCode})`,
    prix_median_m2: medianPricePerSqm ?? 0, prix_moyen_m2: medianPricePerSqm ?? 0,
    nb_transactions_12m: nbComparables, tendance: 'stable', delai_moyen_vente_jours: null,
    dvf_comparables: comparables, listing_comparables: listingResult.listings,
    listing_source: listingResult, subject_lat: geo.lat, subject_lon: geo.lon, fetched_at: now,
  };

  const rapide = Math.round(valuation.marketValue * 0.97);
  const valo = Math.round(valuation.marketValue * 1.05);
  const estimation: Estimation = {
    id: 'villa-aubagne', userId: '', tenantId: '', status: 'ready',
    property: propertyForValuation, fieldStatus: {}, market, valuation,
    saleStrategies: [
      `Vente rapide — Prix affiché : ${rapide.toLocaleString('fr-FR')} €. Délai cible < 60 jours.`,
      `Valorisation — Prix affiché : ${valo.toLocaleString('fr-FR')} €. Délai estimé 90–120 jours.`,
    ],
    branding: null, createdAt: now, updatedAt: now,
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────
  const outDir = resolve(process.cwd(), 'out');
  mkdirSync(outDir, { recursive: true });

  const html = renderBrochureHtml(estimation);
  writeFileSync(resolve(outDir, 'report.html'), html);
  console.log('  ✓ out/report.html');

  const pdf = await renderEstimationPdf(html);
  writeFileSync(resolve(outDir, 'report.pdf'), pdf);
  console.log('  ✓ out/report.pdf', (pdf.length / 1024).toFixed(0), 'Ko');

  // PNG preview (pleine page)
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 820, height: 1160 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page
    .evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready)
    .catch(() => {});
  await page.screenshot({ path: resolve(outDir, 'report.png'), fullPage: true });
  await browser.close();
  console.log('  ✓ out/report.png');

  process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
