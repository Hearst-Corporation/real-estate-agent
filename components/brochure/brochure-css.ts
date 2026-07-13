// Brochure CSS — Design System "Agence des Remparts" (éditorial luxe, clair),
// autonome pour export PDF A4. Tokens --ct-* inlinés ici (un export PDF ne peut
// pas @import app/globals.css) mais alignés sur la charte du dashboard : accent
// or Pierre Blonde, fond Lin Brut, texte Ombre Grimaldi. Ajuster ce thème =
// éditer ce fichier.
// Typo : Satoshi (chargée via <link> dans render-html.ts, fallback Inter).
// Modèle 2 PAGES strict : chaque .page = 210×297 mm, overflow hidden, page-break-after.
// Pas de carte Leaflet (aucune coordonnée dans le contrat de données) → le bloc
// "secteur" est une visualisation data-driven (distribution €/m² + positionnement),
// 100 % vectorielle → rendu net à l'impression, zéro dépendance réseau.

export const BROCHURE_CSS = `
:root{
  /* Accent — Or "Pierre Blonde" (échelle alignée sur app/globals.css). */
  --ct-accent-50:#faf8f4;
  --ct-accent-200:#e6d9c4;
  --ct-accent-300:#dcc9ab;
  --ct-accent:#c9b08a;
  --ct-accent-600:#b2955f;
  --ct-accent-700:#8f7549;
  --ct-accent-900:#4c3e28;
  --ct-accent-soft:rgba(201,176,138,0.14);
  --ct-border-accent:rgba(201,176,138,0.45);

  /* Fond & surfaces — Lin Brut (crème) + blanc flottant. */
  --ct-bg:#f7f5f0;
  --ct-surface:#ffffff;
  --ct-surface-tint:#fbf9f5;

  /* Texte — Ombre Grimaldi. */
  --ct-text-strong:#1f1c17;
  --ct-text-primary:#2c2c2c;
  --ct-text-body:#57524a;
  --ct-text-muted:#8b8478;
  --ct-text-faint:#b3ac9e;

  --ct-border-soft:rgba(44,36,24,0.07);
  --ct-border:rgba(44,36,24,0.12);
  --ct-border-strong:rgba(44,36,24,0.18);

  --ct-shadow-card:0 1px 2px rgba(120,95,55,.07),0 8px 24px -8px rgba(120,95,55,.14);

  --ct-success:#1e7a4a;
  --ct-success-soft:#eaf3ec;
  --ct-danger:#a13a3a;

  --sans:"Satoshi","Inter",-apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
.num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}

@page{size:A4;margin:0}
.brochure-root{
  font-family:var(--sans);color:var(--ct-text-primary);
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  print-color-adjust:exact;-webkit-print-color-adjust:exact;
  background:var(--ct-bg);
}

/* ---------- page ---------- */
.page{position:relative;width:210mm;height:297mm;color:var(--ct-text-primary);
  padding:15mm 14mm;display:flex;flex-direction:column;overflow:hidden;
  page-break-after:always;break-after:page;
  background:var(--ct-bg);}
.page:last-child{page-break-after:auto;break-after:auto}

/* ---------- running head ---------- */
.rhead{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;
  padding-bottom:10px;border-bottom:1.6px solid var(--ct-text-primary);margin-bottom:14px}
.brand{display:flex;align-items:center;gap:9px}
.mono{display:inline-grid;place-items:center;width:25px;height:25px;border-radius:7px;
  background:var(--ct-accent);color:var(--ct-text-strong);font-weight:800;
  font-size:13px;letter-spacing:-.03em}
.bn{display:flex;flex-direction:column;line-height:1.1}
.bn b{font-size:11.5px;font-weight:700;letter-spacing:.01em;color:var(--ct-text-strong)}
.bn i{font-style:normal;font-size:7.5px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--ct-accent-700)}
.rmeta{display:flex;align-items:center;gap:8px;font-size:8px;font-weight:600;letter-spacing:.05em;
  color:var(--ct-text-muted);font-variant-numeric:tabular-nums}
.rmeta .conf{color:var(--ct-accent-700);text-transform:uppercase;letter-spacing:.14em;font-weight:800}
.rmeta .sep{color:var(--ct-text-faint)}

/* ---------- hero ---------- */
.hero{display:grid;grid-template-columns:1.28fr 1fr;gap:18px;margin-bottom:14px;align-items:start}
.kdoc{font-size:8px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;
  color:var(--ct-accent-700);margin-bottom:9px}
.hero h1{font-size:25px;font-weight:700;letter-spacing:-.02em;line-height:1.15;color:var(--ct-text-strong)}
.hero h1 .addr-line{color:var(--ct-text-body);font-weight:600;font-size:18px}
.addr{font-size:10px;color:var(--ct-text-muted);font-weight:500;margin-top:6px;letter-spacing:.01em}
.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:13px}
.chip{font-size:8.5px;font-weight:600;letter-spacing:.01em;color:var(--ct-text-body);
  background:var(--ct-surface);border:1px solid var(--ct-border);
  border-radius:6px;padding:3px 9px;font-variant-numeric:tabular-nums}
.chip b{color:var(--ct-accent-700);font-weight:800}

/* valuebox — encart "Valeur vénale estimée" (surface canonique claire) */
.valuebox{position:relative;overflow:hidden;border-radius:14px;padding:16px 18px;
  display:flex;flex-direction:column;
  border:1px solid var(--ct-border-accent);box-shadow:var(--ct-shadow-card);
  background:var(--ct-surface)}
.valuebox::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;
  background:var(--ct-accent)}
.vb-lab{font-size:7.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--ct-text-muted);margin-bottom:2px}
.bigval{font-size:44px;font-weight:700;letter-spacing:-.03em;line-height:1;margin:3px 0 14px;
  font-variant-numeric:tabular-nums;color:var(--ct-text-strong)}
.bigval .cur{font-size:.44em;font-weight:600;letter-spacing:0;vertical-align:.1em;color:var(--ct-accent-700)}
.vb-range{margin-bottom:12px}
.vr-row{display:flex;justify-content:space-between;align-items:baseline;font-size:7.5px;
  color:var(--ct-text-muted);font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em}
.vr-row .num{color:var(--ct-text-strong);font-weight:700;letter-spacing:0;text-transform:none}
.rangebar{position:relative;height:6px;border-radius:4px;
  background:linear-gradient(90deg,var(--ct-accent-200),var(--ct-accent))}
.rb-cur{position:absolute;top:-4px;width:2.5px;height:14px;
  background:var(--ct-text-strong);border-radius:1px;transform:translateX(-1.25px)}
.rb-reco{position:absolute;top:-3px;width:10px;height:10px;border-radius:50%;
  background:var(--ct-surface);transform:translate(-5px,0);
  box-shadow:0 0 0 2px var(--ct-accent-700)}
.vr-foot{display:flex;justify-content:space-between;align-items:center;margin-top:7px;
  font-size:7.5px;color:var(--ct-text-faint);font-variant-numeric:tabular-nums}
.reco-tag{font-size:7.5px;font-weight:800;color:var(--ct-accent-700);letter-spacing:.02em}
.vmeta{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-top:auto;
  padding-top:13px;border-top:1px solid var(--ct-border)}
.vmeta>div{display:flex;flex-direction:column;gap:1px}
.vm-l{font-size:7px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ct-text-muted)}
.vm-v{font-size:16px;font-weight:700;letter-spacing:-.02em;color:var(--ct-text-strong);
  font-variant-numeric:tabular-nums;line-height:1.1}

/* ---------- KPI strip ---------- */
.kpis{display:grid;grid-template-columns:repeat(4,1fr);border-radius:12px;overflow:hidden;margin-bottom:14px;
  background:var(--ct-surface);border:1px solid var(--ct-border);box-shadow:var(--ct-shadow-card)}
.kpi{padding:11px 14px;border-right:1px solid var(--ct-border);display:flex;flex-direction:column;gap:3px}
.kpi:last-child{border-right:0}
.kl{font-size:7px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ct-text-muted)}
.kv{font-size:20px;font-weight:700;letter-spacing:-.02em;color:var(--ct-text-strong);
  font-variant-numeric:tabular-nums;line-height:1.1}
.kv.up{color:var(--ct-success)}
.kd{font-size:7px;color:var(--ct-text-faint);font-weight:500}

/* ---------- eyebrow ---------- */
.eb{display:flex;align-items:center;gap:10px;margin-bottom:11px}
.eb .n{font-size:15px;font-weight:700;color:var(--ct-accent-700);
  font-variant-numeric:tabular-nums;letter-spacing:-.02em;line-height:1}
.eb .tx{font-size:9.5px;font-weight:800;letter-spacing:.16em;color:var(--ct-text-strong);
  text-transform:uppercase;white-space:nowrap}
.eb .ln{flex:1;height:1px;background:var(--ct-border)}

/* ---------- split (secteur viz + bien) ---------- */
.split{display:grid;grid-template-columns:1.22fr 1fr;gap:14px}
.sidecol{display:flex;flex-direction:column;gap:10px}
.specs{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;border-radius:12px;padding:5px 13px;
  background:var(--ct-surface);border:1px solid var(--ct-border);box-shadow:var(--ct-shadow-card)}
.srow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;
  border-bottom:1px solid var(--ct-border-soft);font-size:8.5px}
.srow:last-child{border-bottom:0}
.srow span{color:var(--ct-text-muted);font-weight:500}
.srow b{color:var(--ct-text-strong);font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.srow b em{font-style:normal;color:var(--ct-accent-700)}
.expert{border-left:2px solid var(--ct-accent);padding-left:10px}
.expert h3{font-size:8px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ct-accent-700);margin-bottom:5px}
.expert p{font-size:8.8px;line-height:1.52;color:var(--ct-text-body)}
.expert p b{color:var(--ct-text-strong);font-weight:700}
.dvfnote{border:1px solid var(--ct-border-accent);border-left:3px solid var(--ct-accent);
  background:var(--ct-accent-soft);border-radius:0 10px 10px 0;padding:9px 12px}
.dvfnote h4{font-size:7.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ct-accent-700);margin-bottom:3px}
.dvfnote p{font-size:7.8px;line-height:1.45;color:var(--ct-text-body)}
.dvfnote b{color:var(--ct-text-strong);font-weight:700}
.dvfnote i{color:var(--ct-text-muted);font-style:italic}

/* ---------- panels / charts (secteur) ---------- */
.panel{border-radius:12px;padding:11px 13px;display:flex;flex-direction:column;
  background:var(--ct-surface);border:1px solid var(--ct-border);box-shadow:var(--ct-shadow-card)}
.pt{font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
  color:var(--ct-text-strong);margin-bottom:1px}
.ps{font-size:7px;color:var(--ct-text-faint);font-weight:500;margin-bottom:8px}
.psum{font-size:7.8px;line-height:1.4;color:var(--ct-text-body);margin-top:auto;padding-top:8px}
.psum b{color:var(--ct-accent-700);font-weight:800;font-variant-numeric:tabular-nums}
.posbar{position:relative;height:7px;border-radius:4px;margin-top:6px;
  background:linear-gradient(90deg,var(--ct-success),var(--ct-accent) 50%,var(--ct-accent-700))}
.posbar i{position:absolute;top:-4px;width:3px;height:15px;
  background:var(--ct-text-strong);border-radius:1.5px;transform:translateX(-1.5px)}
.posax{display:flex;justify-content:space-between;font-size:6.5px;color:var(--ct-text-faint);
  margin-top:4px;text-transform:uppercase;letter-spacing:.06em}
.dist{display:flex;align-items:flex-end;gap:3px;height:62px;margin-top:6px}
.dist .bar{flex:1;background:var(--ct-accent-50);border:1px solid var(--ct-border);border-radius:2px 2px 0 0;position:relative;min-height:2px}
.dist .bar.me{background:var(--ct-accent);border-color:var(--ct-accent-700)}
.dist .bar.me::after{content:"BIEN";position:absolute;top:-9px;left:50%;transform:translateX(-50%);
  font-size:5.5px;font-weight:800;letter-spacing:.06em;color:var(--ct-accent-700);white-space:nowrap}
.distx{display:flex;justify-content:space-between;font-size:5.8px;color:var(--ct-text-faint);
  margin-top:3px;font-variant-numeric:tabular-nums}
.secteur{display:grid;grid-template-rows:auto auto;gap:12px}

/* ---------- carte de secteur (tuiles OpenStreetMap, zéro clé API) ---------- */
.panel-map{overflow:hidden}
.sectormap{position:relative;overflow:hidden;border-radius:10px;margin-top:6px;
  border:1px solid var(--ct-border);background:var(--ct-accent-50)}
.smtiles{position:absolute;inset:0}
.smtiles img{display:block;max-width:none}
.smfade{position:absolute;inset:0;pointer-events:none;
  box-shadow:inset 0 0 22px 4px rgba(44,36,24,.10)}
.smpin{position:absolute;transform:translate(-50%,-50%);min-width:15px;height:15px;
  display:grid;place-items:center;border-radius:50%;
  background:var(--ct-surface);border:1.5px solid var(--ct-accent-700);
  color:var(--ct-accent-900);font-size:7.5px;font-weight:800;line-height:1;
  font-variant-numeric:tabular-nums;padding:0 3px;
  box-shadow:0 1px 4px -1px rgba(44,36,24,.35)}
.smpin.me{width:17px;height:17px;border:0;background:var(--ct-accent-700);
  box-shadow:0 0 0 4px var(--ct-accent-soft),0 2px 8px -1px rgba(120,95,55,.5);z-index:2}
.smattr{position:absolute;right:7px;bottom:6px;font-size:6.5px;font-weight:600;
  color:var(--ct-text-muted);background:rgba(255,255,255,.85);padding:1px 6px;border-radius:5px}
.smleg{position:absolute;left:8px;top:7px;font-size:7px;font-weight:700;letter-spacing:.03em;
  color:var(--ct-text-strong);background:rgba(255,255,255,.9);padding:3px 8px;border-radius:6px;
  border:1px solid var(--ct-border)}

/* ---------- table DVF + annonces ---------- */
.two{display:grid;grid-template-columns:1.25fr 1fr;gap:16px;margin-bottom:14px}
.dvf{width:100%;border-collapse:collapse;font-size:8.8px}
.dvf th{font-size:7px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  color:var(--ct-text-muted);text-align:left;padding:0 8px 6px;
  border-bottom:1.6px solid var(--ct-accent-700)}
.dvf th.r,.dvf td.r{text-align:right}
.dvf tbody tr:nth-child(odd) td{background:var(--ct-surface-tint)}
.dvf td{padding:6px 8px;border-bottom:1px solid var(--ct-border-soft);color:var(--ct-text-body)}
.dvf tbody tr:last-child td{border-bottom:0}
.dvf .pm{color:var(--ct-accent-700);font-weight:800;font-variant-numeric:tabular-nums}
.dvf .ty{color:var(--ct-text-strong);font-weight:600}
.dvf .muted{color:var(--ct-text-faint);font-style:italic}
.tnote{font-size:7px;color:var(--ct-text-muted);margin-top:6px;font-variant-numeric:tabular-nums}
.tnote b{color:var(--ct-accent-700)}
.lst{border-radius:10px;padding:9px 12px;margin-bottom:6px;
  background:var(--ct-surface);border:1px solid var(--ct-border)}
.lst:last-child{margin-bottom:0}
.lst-meta{font-size:8px;color:var(--ct-text-muted);margin-top:3px;font-variant-numeric:tabular-nums}
.lst-meta b{color:var(--ct-text-body);font-weight:600}

/* ---------- cards photo (annonces comparables) ---------- */
.lstgrid{display:flex;flex-direction:column;gap:8px}
.lcard{display:flex;gap:10px;border-radius:11px;overflow:hidden;
  background:var(--ct-surface);border:1px solid var(--ct-border);box-shadow:var(--ct-shadow-card)}
.lcard-img{position:relative;flex:0 0 76px;height:76px;overflow:hidden;background:var(--ct-accent-50)}
.lcard-img img{width:100%;height:100%;object-fit:cover;display:block}
.lcard-noimg{width:100%;height:100%;background:var(--ct-accent-50)}
.lcard-no{position:absolute;left:5px;top:5px;width:14px;height:14px;display:grid;place-items:center;
  border-radius:50%;background:var(--ct-accent);color:var(--ct-text-strong);
  font-size:7.5px;font-weight:800;line-height:1}
.lcard-b{flex:1;min-width:0;padding:8px 10px 8px 0;display:flex;flex-direction:column;justify-content:center}
.lcard-px{font-size:13px;font-weight:800;color:var(--ct-accent-700);
  letter-spacing:-.015em;line-height:1}
.lcard-t{font-size:8px;font-weight:700;color:var(--ct-text-strong);margin-top:3px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lcard-m{font-size:7.5px;color:var(--ct-text-muted);margin-top:2px;font-variant-numeric:tabular-nums}
.lcard-m b{color:var(--ct-text-body);font-weight:600}

/* ---------- stratégies ---------- */
.strat{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.stratc{border-radius:14px;padding:15px 17px;position:relative;
  background:var(--ct-surface);border:1px solid var(--ct-border);box-shadow:var(--ct-shadow-card)}
.stratc.reco{border-color:var(--ct-border-accent)}
.stratc.reco::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:var(--ct-accent)}
.stratc h3{font-size:12px;font-weight:700;color:var(--ct-text-strong);letter-spacing:-.01em;margin-bottom:5px}
.stratc .p{font-size:23px;font-weight:700;color:var(--ct-text-strong);
  font-variant-numeric:tabular-nums;letter-spacing:-.02em;margin:0 0 3px;line-height:1}
.stratc.reco .p{color:var(--ct-accent-700)}
.stratc .sd{font-size:7.5px;color:var(--ct-text-muted);font-weight:700;
  text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px}
.stratc .sd b{color:var(--ct-text-primary);font-weight:800}
.stratc .desc{font-size:8.3px;line-height:1.5;color:var(--ct-text-body);
  border-top:1px solid var(--ct-border-soft);padding-top:8px}
.reco-badge{position:absolute;top:13px;right:15px;font-size:6.5px;font-weight:800;letter-spacing:.12em;
  text-transform:uppercase;color:var(--ct-text-strong);background:var(--ct-accent-200);
  padding:3px 8px;border-radius:6px}

/* ---------- méthodo + sources ---------- */
.metho{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.metho h3{font-size:8px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ct-accent-700);margin-bottom:6px}
.metho p{font-size:8.2px;line-height:1.52;color:var(--ct-text-body)}
.metho p b{color:var(--ct-text-strong);font-weight:700}
.sources{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.src{font-size:7.5px;font-weight:600;color:var(--ct-text-body);
  background:var(--ct-surface);border:1px solid var(--ct-border);border-radius:6px;padding:3px 8px}
.src b{color:var(--ct-accent-700);font-weight:800}
.mnote{font-size:7.5px;color:var(--ct-text-muted);margin-top:8px;line-height:1.4}
.mnote b{color:var(--ct-text-primary);font-weight:700}

/* ---------- réserves / mentions (exempté du firewall via .reserves-section) ---------- */
.reserves-section{margin-top:13px;border:1px solid var(--ct-border);
  border-left:3px solid var(--ct-accent-600);
  background:var(--ct-surface-tint);padding:10px 14px;border-radius:0 10px 10px 0}
.res-title{font-size:7.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ct-accent-700);margin-bottom:4px}
.reserve-item{display:flex;gap:8px;font-size:7.5px;line-height:1.45;
  color:var(--ct-text-muted);margin-bottom:2px}
.reserve-item:last-child{margin-bottom:0}
.reserve-field{color:var(--ct-text-primary);font-weight:700;white-space:nowrap}
.reserve-note{color:var(--ct-text-muted)}
.disc{font-size:7.5px;line-height:1.5;color:var(--ct-text-muted)}
.disc b{color:var(--ct-text-primary);font-weight:700}

/* ---------- footer ---------- */
.foot{margin-top:auto;padding-top:10px;border-top:1px solid var(--ct-border);display:flex;
  justify-content:space-between;align-items:center;font-size:7.5px;
  color:var(--ct-text-muted);font-weight:500;letter-spacing:.03em}
.foot .fp{font-variant-numeric:tabular-nums}
.foot .fp b{color:var(--ct-accent-700);font-weight:800}
`;
