/**
 * Doc PROPRE — villa SCI (41 impasse du cercle, Aubagne).
 * Prend les VRAIES infos du projet (initial-project.ts) + scrape marché live
 * (DVF + annonces LeBonCoin avec photos/géoloc) → un seul HTML clair → PDF.
 *
 *   NODE_ENV=production pnpm dlx tsx --env-file=.env.local scripts/villa-doc.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { geocode } from '@/lib/estimation/geocode';
import { candidateSections } from '@/lib/estimation/sections';
import { resolveParcelle } from '@/lib/estimation/cadastre';
import { fetchMutationsMultiSection } from '@/lib/estimation/dvf';
import { buildComparables } from '@/lib/estimation/comparables';
import { fetchListingComparables } from '@/lib/estimation/listings';
import { buildStaticMap } from '@/lib/estimation/staticmap';

const eur = (n: number) => n.toLocaleString('fr-FR') + ' €';
const pm2 = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' €/m²';

// ── VRAIES infos du bien (src/lib/data/initial-project.ts du projet SCI) ───────
const BIEN = {
  adresse: '41 impasse du cercle, 13400 Aubagne',
  ville: 'Aubagne', cp: '13400',
  type: 'Villa de 2 logements (copropriété)',
  terrain: 950,
  travaux: { montant: 50000, date: 'juin 2025', label: 'Travaux du RDC + mise en copropriété' },
  prixAchat: 250000,
  prixBase: 200000,
  valeurMichel: 650000,
  refPrix: 'Michel Morgana (vendeur)',
  lots: [
    { label: 'RDC', rooms: 'T4', valeur: 430000, occupant: 'Dylan', statut: 'Occupé', loyer: 1800 },
    { label: 'Étage', rooms: 'T2', valeur: 220000, occupant: null, statut: 'Loué meublé', loyer: 1200 },
  ],
  associes: ['Salima Attalah', 'Dylan Kebaili', 'Michel Morgana', 'Analisa Kebaili'],
};

async function main() {
  const loyerAn = BIEN.lots.reduce((s, l) => s + l.loyer, 0) * 12;

  // ── Scrape marché ───────────────────────────────────────────────────────
  const geo = await geocode(BIEN.adresse);
  if (!geo) throw new Error('géocodage échoué');
  const parcelle = await resolveParcelle(geo.lat, geo.lon);
  const sections = await candidateSections(geo.lat, geo.lon, parcelle?.section);
  const mutations = await fetchMutationsMultiSection(geo.inseeCode, sections);
  const { medianPricePerSqm, nbComparables } = buildComparables(
    { type_bien: 'maison', nombre_pieces: null, surface: null, lat: geo.lat, lon: geo.lon },
    mutations,
  );
  const listingRes = await fetchListingComparables({
    ville: BIEN.ville, codePostal: BIEN.cp, typeBien: 'maison', surface: null, nbPieces: null,
  });
  const listings = listingRes.listings;
  console.log(`geo ${geo.inseeCode} · DVF médiane ${medianPricePerSqm} (${nbComparables} comps) · ${listings.length} annonces (${listingRes.source})`);

  const median = medianPricePerSqm ?? 0;
  const cards = listings.filter((l) => l.photo_url).slice(0, 6);
  const geoListings = listings.filter((l) => l.lat != null && l.lon != null)
    .map((l) => ({ lat: l.lat as number, lon: l.lon as number }));
  const map = buildStaticMap({ subject: { lat: geo.lat, lon: geo.lon }, listings: geoListings, width: 980, height: 360 });

  const rendementAchat = (loyerAn / BIEN.prixAchat) * 100;
  const rendementMarche = (loyerAn / BIEN.valeurMichel) * 100;
  const decote = BIEN.valeurMichel - BIEN.prixAchat;

  // ── HTML propre (thème clair, imprimable A4) ──────────────────────────────
  const lotsRows = BIEN.lots.map((l) => `
      <tr>
        <td><b>${l.label}</b> · ${l.rooms}</td>
        <td>${l.statut}${l.occupant ? ` (${l.occupant})` : ''}</td>
        <td class="r">${eur(l.loyer)}/mois</td>
        <td class="r"><b>${eur(l.valeur)}</b></td>
      </tr>`).join('');

  const cardsHtml = cards.map((l, i) => `
      <a class="card" href="${l.url ?? '#'}">
        <div class="card-img"><img src="${l.photo_url}" alt=""><span class="pin">${i + 1}</span></div>
        <div class="card-b">
          <div class="px">${eur(l.prix)}</div>
          <div class="ti">${l.titre}</div>
          <div class="me">${l.surface_m2} m² · ${pm2(l.prix_m2)}${l.quartier ? ` · ${l.quartier}` : ''}</div>
        </div>
      </a>`).join('');

  const tilesHtml = map ? map.tiles.map((t) =>
    `<img class="tile" src="${t.url}" style="left:${t.left}px;top:${t.top}px" width="256" height="256" alt="">`).join('') : '';
  const pinsHtml = map ? [
    ...map.listings.map((m, i) => `<span class="mpin" style="left:${m.left}px;top:${m.top}px">${i + 1}</span>`),
    map.subject ? `<span class="mpin me" style="left:${map.subject.left}px;top:${map.subject.top}px"></span>` : '',
  ].join('') : '';

  const today = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    .format(new Date(Date.parse('2026-06-18')));

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page{size:A4;margin:14mm}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Inter",system-ui,sans-serif;color:#1a1f2b;line-height:1.5;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .num{font-variant-numeric:tabular-nums}
  h1{font-size:23px;font-weight:800;letter-spacing:-.02em}
  .sub{color:#6b7280;font-size:12px;margin-top:2px}
  .top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:16px}
  .eyebrow{font-size:9px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#9ca3af}
  .badge{background:#0f172a;color:#fff;font-size:10px;font-weight:700;padding:5px 11px;border-radius:8px}
  h2{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#0f172a;margin:18px 0 8px;padding-bottom:5px;border-bottom:1px solid #e5e7eb}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .kpi{border:1px solid #e5e7eb;border-radius:10px;padding:11px 13px;background:#f9fafb}
  .kpi .l{font-size:8.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af}
  .kpi .v{font-size:20px;font-weight:800;letter-spacing:-.02em;margin-top:3px;color:#0f172a}
  .kpi .d{font-size:9px;color:#6b7280;margin-top:1px}
  .kpi.hot{background:#fef2f2;border-color:#fecaca}.kpi.hot .v{color:#b91c1c}
  .kpi.ok{background:#f0fdf4;border-color:#bbf7d0}.kpi.ok .v{color:#15803d}
  table{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:4px}
  th{text-align:left;font-size:8.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;padding:0 8px 6px;border-bottom:1.5px solid #0f172a}
  td{padding:7px 8px;border-bottom:1px solid #eef0f3}
  .r{text-align:right}
  tfoot td{border-top:1.5px solid #0f172a;border-bottom:0;font-weight:800;padding-top:8px}
  .twocol{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .note{font-size:9.5px;color:#6b7280;margin-top:6px}
  .map{position:relative;width:100%;height:360px;border-radius:12px;overflow:hidden;border:1px solid #d1d5db;background:#e5e7eb;margin-top:4px}
  .map .tile{position:absolute;display:block;max-width:none}
  .mpin{position:absolute;transform:translate(-50%,-50%);min-width:17px;height:17px;display:grid;place-items:center;border-radius:50%;background:#fff;border:1.5px solid #0f172a;color:#0f172a;font-size:9px;font-weight:800;box-shadow:0 1px 4px rgba(0,0,0,.3)}
  .mpin.me{width:19px;height:19px;background:#dc2626;border:0;box-shadow:0 0 0 4px rgba(220,38,38,.25);z-index:2}
  .attr{position:absolute;right:6px;bottom:5px;font-size:8px;color:#374151;background:rgba(255,255,255,.8);padding:1px 6px;border-radius:5px}
  .grid-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;margin-top:6px}
  .card{display:flex;flex-direction:column;border:1px solid #e5e7eb;border-radius:11px;overflow:hidden;text-decoration:none;color:inherit;background:#fff}
  .card-img{position:relative;height:96px;background:#f3f4f6}
  .card-img img{width:100%;height:100%;object-fit:cover;display:block}
  .pin{position:absolute;left:6px;top:6px;width:16px;height:16px;display:grid;place-items:center;border-radius:50%;background:#dc2626;color:#fff;font-size:9px;font-weight:800}
  .card-b{padding:7px 10px 9px}
  .px{font-size:14px;font-weight:800;color:#b91c1c;letter-spacing:-.02em}
  .ti{font-size:9px;font-weight:700;margin-top:2px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .me{font-size:8.5px;color:#6b7280;margin-top:1px}
  .synth{border:1px solid #fecaca;background:#fef2f2;border-radius:10px;padding:12px 14px;margin-top:6px}
  .synth p{font-size:10.5px;color:#7f1d1d}.synth b{color:#b91c1c}
  .foot{margin-top:18px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:8.5px;color:#9ca3af;display:flex;justify-content:space-between}
</style></head><body>

<div class="top">
  <div>
    <div class="eyebrow">Dossier d'acquisition · SCI familiale</div>
    <h1>${BIEN.adresse}</h1>
    <div class="sub">${BIEN.type} · terrain ${BIEN.terrain} m² · parking</div>
  </div>
  <div class="badge">Prix négocié ${eur(BIEN.prixAchat)}</div>
</div>

<div class="grid3">
  <div class="kpi"><div class="l">Valeur vendeur (Michel)</div><div class="v num">${eur(BIEN.valeurMichel)}</div><div class="d">somme des 2 lots</div></div>
  <div class="kpi hot"><div class="l">Prix de vente négocié</div><div class="v num">${eur(BIEN.prixAchat)}</div><div class="d">${eur(BIEN.prixBase)} + ${eur(BIEN.travaux.montant)} travaux</div></div>
  <div class="kpi ok"><div class="l">Décote familiale</div><div class="v num">− ${eur(decote)}</div><div class="d">vs valeur vendeur</div></div>
</div>

<h2>Le bien — composition</h2>
<table>
  <thead><tr><th>Lot</th><th>Situation locative</th><th class="r">Loyer</th><th class="r">Valeur (Michel)</th></tr></thead>
  <tbody>${lotsRows}</tbody>
  <tfoot><tr><td>Total</td><td>${eur(loyerAn)}/an de loyers</td><td class="r">${eur(loyerAn / 12)}/mois</td><td class="r">${eur(BIEN.valeurMichel)}</td></tr></tfoot>
</table>
<p class="note">Travaux : ${BIEN.travaux.label} — ${eur(BIEN.travaux.montant)} (${BIEN.travaux.date}). Référence de prix : ${BIEN.refPrix}. SCI : ${BIEN.associes.join(', ')}.</p>

<div class="twocol">
  <div>
    <h2>Marché local (Aubagne ${geo.inseeCode})</h2>
    <div class="kpi"><div class="l">Prix m² médian — ventes réelles DVF</div><div class="v num">${pm2(median)}</div><div class="d">${nbComparables} maisons comparables · DVF Etalab</div></div>
    <p class="note">À titre indicatif, un bien de 120 m² habitables au prix médian du secteur représenterait ≈ ${eur(median * 120)}. La surface habitable exacte de la villa reste à confirmer pour figer une estimation au m².</p>
  </div>
  <div>
    <h2>Rendement locatif</h2>
    <div class="kpi"><div class="l">Sur le prix d'achat (${eur(BIEN.prixAchat)})</div><div class="v num">${rendementAchat.toFixed(1)} %</div><div class="d">brut · ${eur(loyerAn)}/an</div></div>
    <p class="note">Sur la valeur de marché (${eur(BIEN.valeurMichel)}), le rendement brut ressort à ${rendementMarche.toFixed(1)} %.</p>
  </div>
</div>

<h2>Biens à vendre autour</h2>
<div class="map">${tilesHtml}${pinsHtml}<span class="attr">© OpenStreetMap</span></div>
<div class="grid-cards">${cardsHtml}</div>
<p class="note"><b>${listings.length} biens à vendre</b> détectés autour (${listingRes.source === 'apify' ? 'LeBonCoin' : listingRes.source}) · rayon ≈ 8 km. Le point rouge = la villa ; les numéros = les annonces ci-dessus.</p>

<div class="synth">
  <p><b>Synthèse.</b> La villa est vendue ${eur(BIEN.prixAchat)} alors que sa valeur (vendeur ${eur(BIEN.valeurMichel)} ; marché Aubagne ≈ ${pm2(median)}) et les biens comparables à vendre autour (jusqu'à ${eur(Math.max(...listings.map((l) => l.prix)))}) la situent nettement au-dessus — soit une décote familiale d'environ <b>${eur(decote)}</b>. Acquisition portée par la SCI à 4 associés, dossier bancaire en cours.</p>
</div>

<div class="foot"><span>Doc d'acquisition — ${BIEN.adresse}</span><span>Établi le ${today} · sources : DVF Etalab, LeBonCoin, OpenStreetMap</span></div>

</body></html>`;

  const outDir = resolve(process.cwd(), 'out');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'villa-aubagne.html'), html);

  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  writeFileSync(resolve(outDir, 'villa-aubagne.pdf'), Buffer.from(pdf));
  await page.screenshot({ path: resolve(outDir, 'villa-aubagne.png'), fullPage: true });
  await browser.close();
  console.log('✓ out/villa-aubagne.pdf', (pdf.length / 1024).toFixed(0), 'Ko');
  process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
