/**
 * Aperçu FIDÈLE de la section « Annonces / Biens à vendre autour » du SidePanel,
 * avec le vrai CSS cockpit (00-tokens + 30-crm) + scrape villa live.
 * Réplique exactement le HTML produit par l'edit de SidePanel.tsx → screenshot.
 *
 *   NODE_ENV=production pnpm dlx tsx --env-file=.env.local scripts/preview-sidepanel.ts
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { geocode } from '@/lib/estimation/geocode';
import { candidateSections } from '@/lib/estimation/sections';
import { resolveParcelle } from '@/lib/estimation/cadastre';
import { fetchMutationsMultiSection } from '@/lib/estimation/dvf';
import { fetchListingComparables } from '@/lib/estimation/listings';
import { buildStaticMap } from '@/lib/estimation/staticmap';

const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

async function main() {
  const geo = await geocode('41 impasse du cercle, 13400 Aubagne');
  if (!geo) throw new Error('geo');
  const parcelle = await resolveParcelle(geo.lat, geo.lon);
  const sections = await candidateSections(geo.lat, geo.lon, parcelle?.section);
  await fetchMutationsMultiSection(geo.inseeCode, sections);
  const res = await fetchListingComparables({ ville: 'Aubagne', codePostal: '13400', typeBien: 'maison', surface: null, nbPieces: null });
  const listings = res.listings;
  console.log(`${listings.length} annonces (${res.source}), ${listings.filter(l => l.photo_url).length} avec photo`);

  const map = buildStaticMap({
    subject: { lat: geo.lat, lon: geo.lon },
    listings: listings.filter((l) => l.lat != null && l.lon != null).map((l) => ({ lat: l.lat as number, lon: l.lon as number })),
    width: 560, height: 240,
  });
  const TITLE_MAX = 40;

  const tiles = map ? map.tiles.map((t) => `<img src="${t.url}" alt="" width="256" height="256" style="position:absolute;left:${t.left}px;top:${t.top}px">`).join('') : '';
  const pins = map ? [
    ...map.listings.map((m, i) => `<span class="est-mappin" style="left:${m.left}px;top:${m.top}px">${i + 1}</span>`),
    map.subject ? `<span class="est-mappin me" style="left:${map.subject.left}px;top:${map.subject.top}px"></span>` : '',
  ].join('') : '';
  const rows = listings.map((item, i) => `
    <tr>
      <td class="est-listing-photo">
        ${item.photo_url ? `<img src="${item.photo_url}" alt="Photo de l'annonce" loading="lazy">` : '<span class="est-listing-photo-ph"></span>'}
        <span class="est-listing-photo-no">${i + 1}</span>
      </td>
      <td>${item.titre.length > TITLE_MAX ? item.titre.slice(0, TITLE_MAX) + '…' : item.titre}</td>
      <td class="ct-table-num">${fmt.format(item.prix)}</td>
      <td class="ct-table-num">${item.surface_m2} m²</td>
      <td class="ct-table-num">${fmt.format(item.prix_m2)} / m²</td>
      <td>${item.url ? `<a href="${item.url}" class="est-listing-link">Voir l'annonce</a>` : ''}</td>
    </tr>`).join('');

  const css = ['00-tokens.css', '10-shell.css', '20-estimations-prospection.css', '30-crm.css', '70-graft.css']
    .map((f) => readFileSync(resolve(process.cwd(), 'app/cockpit', f), 'utf8')).join('\n');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${css}
  body{margin:0;padding:24px;background:var(--ct-bg-deep,#1a050b);font-family:Inter,system-ui,sans-serif}
  .est-side{max-width:620px}</style></head>
<body class="ct-cockpit">
<div class="est-side">
  <div class="est-side-section span2">
    <div class="est-side-header static"><span>Biens à vendre autour</span></div>
    <div class="est-side-body">
      <p class="ct-placeholder ct-placeholder-sm ct-mb-sm">Source annonces : <strong>Apify (LeBonCoin)</strong></p>
      <figure class="est-sectormap" style="width:${map?.width}px;height:${map?.height}px">
        <div class="est-sectormap-tiles">${tiles}</div>
        ${pins}
        <figcaption class="est-sectormap-attr">© OpenStreetMap</figcaption>
      </figure>
      <div class="est-listing-table-wrap">
        <table class="est-listing-table">
          <thead><tr><th aria-hidden="true"></th><th>Annonce</th><th>Prix</th><th>Surface</th><th>Prix / m²</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </div>
</div></body></html>`;

  const outDir = resolve(process.cwd(), 'out');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'sidepanel-preview.html'), html);

  const { chromium } = await import('playwright-core');
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 680, height: 760 }, deviceScaleFactor: 2 });
  await p.setContent(html, { waitUntil: 'load', timeout: 30000 });
  await p.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  await p.screenshot({ path: resolve(outDir, 'sidepanel-preview.png'), fullPage: true });
  await b.close();
  console.log('✓ out/sidepanel-preview.png');
  process.exit(0);
}
main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
