// Brochure CSS — Design System Cockpit (verre dépoli bordeaux), autonome pour export PDF A4.
// Tokens --ct-* copiés à l'identique depuis app/cockpit.css (inlinés pour autonomie PDF).
// Typo : Inter (chargée via <link> Google Fonts dans render-html.ts).
// Modèle 2 PAGES strict : chaque .page = 210×297 mm, overflow hidden, page-break-after.
// Pas de carte Leaflet (aucune coordonnée dans le contrat de données) → le bloc
// "secteur" est une visualisation data-driven (distribution €/m² + positionnement),
// 100 % vectorielle → rendu haute définition à l'impression.

export const BROCHURE_CSS = `
:root{
  --ct-bg-deep:#1A050B;
  --ct-accent-maroon:#8A1538;
  --ct-accent:#be123c;
  --ct-accent-strong:#e11d48;
  --ct-accent-soft:rgba(225,29,72,0.18);
  --ct-border-accent:rgba(225,29,72,0.55);
  --ct-surface-0:rgba(255,255,255,0.02);
  --ct-surface-1:rgba(255,255,255,0.04);
  --ct-surface-2:rgba(255,255,255,0.06);
  --ct-surface-3:rgba(255,255,255,0.09);
  --ct-text-strong:#ffffff;
  --ct-text-primary:rgba(245,245,245,0.92);
  --ct-text-body:rgba(245,245,245,0.72);
  --ct-text-muted:rgba(245,245,245,0.48);
  --ct-text-faint:rgba(245,245,245,0.40);
  --ct-border-soft:rgba(255,255,255,0.06);
  --ct-border:rgba(255,255,255,0.10);
  --ct-border-strong:rgba(255,255,255,0.16);
  --ct-shadow-depth:
    inset 0 1px 0 rgba(255,255,255,0.18),
    inset 0 -1px 0 rgba(0,0,0,0.45),
    0 20px 60px -24px rgba(0,0,0,0.65);
  --ct-success:#10b981;
  /* tokens PDF-only (non présents dans cockpit.css) */
  --ct-gradient-pink-pale:#ffd7e0;
  --ct-gold:#a8853f;
  --ct-shadow-pin:rgba(0,0,0,0.38);
  --sans:"Inter",-apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
.num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}

@page{size:A4;margin:0}
.brochure-root{
  font-family:var(--sans);color:var(--ct-text-primary);
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  print-color-adjust:exact;-webkit-print-color-adjust:exact;
  background:var(--ct-bg-deep);
}

/* ---------- page ---------- */
.page{position:relative;width:210mm;height:297mm;color:var(--ct-text-primary);
  padding:13mm;display:flex;flex-direction:column;overflow:hidden;
  page-break-after:always;break-after:page;
  background:
    radial-gradient(ellipse 92% 52% at 50% -4%, rgba(138,21,56,.55) 0%, transparent 60%),
    radial-gradient(ellipse 60% 44% at 102% 104%, rgba(225,29,72,.14) 0%, transparent 55%),
    var(--ct-bg-deep);}
.page:last-child{page-break-after:auto;break-after:auto}

/* ---------- running head ---------- */
.rhead{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;
  padding-bottom:8px;border-bottom:2px solid var(--ct-accent);position:relative;margin-bottom:12px}
.rhead::after{content:"";position:absolute;left:0;right:0;bottom:-3.5px;height:1px;background:var(--ct-border)}
.brand{display:flex;align-items:center;gap:9px}
.mono{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;
  background:linear-gradient(140deg,var(--ct-accent-strong),var(--ct-accent-maroon));
  color:var(--ct-text-strong);font-weight:800;
  font-size:14px;letter-spacing:-.03em;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 2px 8px -2px rgba(225,29,72,.6)}
.bn{display:flex;flex-direction:column;line-height:1.08}
.bn b{font-size:11.5px;font-weight:800;letter-spacing:.01em;color:var(--ct-text-strong)}
.bn i{font-style:normal;font-size:7.5px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:var(--ct-accent-strong)}
.rmeta{display:flex;align-items:center;gap:8px;font-size:8px;font-weight:600;letter-spacing:.05em;
  color:var(--ct-text-muted);font-variant-numeric:tabular-nums}
.rmeta .conf{color:var(--ct-accent-strong);text-transform:uppercase;letter-spacing:.14em;font-weight:800}
.rmeta .sep{color:var(--ct-text-faint)}

/* ---------- hero ---------- */
.hero{display:grid;grid-template-columns:1.28fr 1fr;gap:18px;margin-bottom:13px;align-items:start}
.kdoc{font-size:8px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;
  color:var(--ct-accent-strong);margin-bottom:9px}
.hero h1{font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1.12;color:var(--ct-text-strong)}
.hero h1 .addr-line{color:var(--ct-text-primary);font-weight:700;font-size:20px}
.addr{font-size:10px;color:var(--ct-text-muted);font-weight:500;margin-top:6px;letter-spacing:.01em}
.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:13px}
.chip{font-size:8.5px;font-weight:600;letter-spacing:.01em;color:var(--ct-text-body);
  background:var(--ct-surface-2);border:1px solid var(--ct-border);
  border-radius:6px;padding:3px 9px;font-variant-numeric:tabular-nums}
.chip b{color:var(--ct-accent-strong);font-weight:800}

/* valuebox — encart "Valeur vénale estimée" */
.valuebox{position:relative;overflow:hidden;border-radius:14px;padding:15px 17px;
  display:flex;flex-direction:column;
  border:1px solid var(--ct-border-accent);box-shadow:var(--ct-shadow-depth);
  background:
    radial-gradient(120% 140% at 100% 0%, color-mix(in srgb,var(--ct-accent-strong) 32%,transparent) 0%, transparent 58%),
    linear-gradient(165deg, color-mix(in srgb,var(--ct-accent-strong) 16%,transparent) 0%, color-mix(in srgb,var(--ct-accent-maroon) 8%,transparent) 100%),
    var(--ct-surface-2)}
.valuebox::before{content:"";position:absolute;inset:0;border-radius:14px;
  background:radial-gradient(ellipse 80% 60% at 50% 100%,rgba(225,29,72,.08) 0%,transparent 70%);
  pointer-events:none}
.valuebox::after{content:"";position:absolute;top:0;left:14px;right:14px;height:1px;
  background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ct-accent-strong) 80%,white),transparent)}
.vb-lab{font-size:7.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--ct-text-muted);margin-bottom:1px}
.bigval{font-size:46px;font-weight:800;letter-spacing:-.035em;line-height:1;margin:2px 0 13px;
  font-variant-numeric:tabular-nums;
  background:linear-gradient(175deg,var(--ct-text-strong) 0%,var(--ct-gradient-pink-pale) 130%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.bigval .cur{font-size:.44em;font-weight:700;letter-spacing:0;vertical-align:.1em}
.vb-range{margin-bottom:12px}
.vr-row{display:flex;justify-content:space-between;align-items:baseline;font-size:7.5px;
  color:var(--ct-text-muted);font-weight:700;margin-bottom:5px;text-transform:uppercase;letter-spacing:.08em}
.vr-row .num{color:var(--ct-text-strong);font-weight:700;letter-spacing:0;text-transform:none}
.rangebar{position:relative;height:7px;border-radius:4px;
  background:linear-gradient(90deg,rgba(255,255,255,.14),var(--ct-accent-strong))}
.rb-cur{position:absolute;top:-3.5px;width:2.5px;height:14px;
  background:var(--ct-text-strong);border-radius:1px;transform:translateX(-1.25px);
  box-shadow:0 0 0 2px var(--ct-shadow-pin)}
.rb-reco{position:absolute;top:-2.5px;width:10px;height:10px;border-radius:50%;
  background:var(--ct-text-strong);transform:translate(-5px,0);
  box-shadow:0 0 0 2px var(--ct-accent-strong)}
.vr-foot{display:flex;justify-content:space-between;align-items:center;margin-top:6px;
  font-size:7.5px;color:var(--ct-text-faint);font-variant-numeric:tabular-nums}
.reco-tag{font-size:7.5px;font-weight:800;color:var(--ct-text-strong);letter-spacing:.02em}
.vmeta{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-top:auto;
  padding-top:12px;border-top:1px solid var(--ct-border)}
.vmeta>div{display:flex;flex-direction:column;gap:1px}
.vm-l{font-size:7px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ct-text-muted)}
.vm-v{font-size:17px;font-weight:800;letter-spacing:-.02em;color:var(--ct-text-strong);
  font-variant-numeric:tabular-nums;line-height:1.08}
.vm-v small{font-size:.48em;font-weight:600;color:var(--ct-text-faint);letter-spacing:0}

/* ---------- KPI strip ---------- */
.kpis{display:grid;grid-template-columns:repeat(4,1fr);border-radius:12px;overflow:hidden;margin-bottom:13px;
  background:linear-gradient(160deg,rgba(255,255,255,.048) 0%,transparent 44%),var(--ct-surface-1);
  border:1px solid var(--ct-border);box-shadow:var(--ct-shadow-depth);position:relative}
.kpis::after{content:"";position:absolute;top:0;left:18px;right:18px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent)}
.kpi{padding:11px 13px;border-right:1px solid var(--ct-border);display:flex;flex-direction:column;gap:3px}
.kpi:last-child{border-right:0}
.kl{font-size:7px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ct-text-muted)}
.kv{font-size:21px;font-weight:800;letter-spacing:-.025em;color:var(--ct-text-strong);
  font-variant-numeric:tabular-nums;line-height:1.06}
.kv.up{color:var(--ct-success)}
.kd{font-size:7px;color:var(--ct-text-faint);font-weight:500}

/* ---------- eyebrow ---------- */
.eb{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.eb .n{font-size:16px;font-weight:800;color:var(--ct-accent-strong);
  font-variant-numeric:tabular-nums;letter-spacing:-.03em;line-height:1}
.eb .tx{font-size:9.5px;font-weight:800;letter-spacing:.16em;color:var(--ct-text-primary);
  text-transform:uppercase;white-space:nowrap}
.eb .ln{flex:1;height:1px;background:linear-gradient(90deg,var(--ct-border),transparent)}

/* ---------- split (secteur viz + bien) ---------- */
.split{display:grid;grid-template-columns:1.22fr 1fr;gap:14px}
.sidecol{display:flex;flex-direction:column;gap:10px}
.specs{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;border-radius:12px;padding:4px 12px;
  background:linear-gradient(160deg,rgba(255,255,255,.045) 0%,transparent 44%),var(--ct-surface-1);
  border:1px solid var(--ct-border);box-shadow:var(--ct-shadow-depth)}
.srow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;
  border-bottom:1px solid var(--ct-border-soft);font-size:8.5px}
.srow:last-child{border-bottom:0}
.srow span{color:var(--ct-text-muted);font-weight:500}
.srow b{color:var(--ct-text-strong);font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.srow b em{font-style:normal;color:var(--ct-accent-strong)}
.expert{border-left:2px solid var(--ct-border-accent);padding-left:9px}
.expert h3{font-size:8px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ct-accent-strong);margin-bottom:5px}
.expert p{font-size:8.8px;line-height:1.52;color:var(--ct-text-body)}
.expert p b{color:var(--ct-text-strong);font-weight:700}
.dvfnote{border:1px solid var(--ct-border-accent);border-left:3px solid var(--ct-accent-strong);
  background:var(--ct-accent-soft);border-radius:0 10px 10px 0;padding:8px 11px}
.dvfnote h4{font-size:7.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ct-accent-strong);margin-bottom:3px}
.dvfnote p{font-size:7.8px;line-height:1.45;color:var(--ct-text-body)}
.dvfnote b{color:var(--ct-text-strong);font-weight:700}
.dvfnote i{color:var(--ct-text-muted);font-style:italic}

/* ---------- panels / charts (secteur) ---------- */
.panel{border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;
  background:linear-gradient(160deg,rgba(255,255,255,.045) 0%,transparent 44%),var(--ct-surface-1);
  border:1px solid var(--ct-border);box-shadow:var(--ct-shadow-depth)}
.pt{font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
  color:var(--ct-text-primary);margin-bottom:1px}
.ps{font-size:7px;color:var(--ct-text-faint);font-weight:500;margin-bottom:7px}
.psum{font-size:7.8px;line-height:1.4;color:var(--ct-text-body);margin-top:auto;padding-top:7px}
.psum b{color:var(--ct-accent-strong);font-weight:800;font-variant-numeric:tabular-nums}
.posbar{position:relative;height:8px;border-radius:4px;margin-top:6px;
  background:linear-gradient(90deg,var(--ct-success),var(--ct-gold) 50%,var(--ct-accent-strong))}
.posbar i{position:absolute;top:-3.5px;width:3px;height:15px;
  background:var(--ct-text-strong);border-radius:1.5px;transform:translateX(-1.5px);
  box-shadow:0 0 0 2px var(--ct-shadow-pin)}
.posax{display:flex;justify-content:space-between;font-size:6.5px;color:var(--ct-text-faint);
  margin-top:4px;text-transform:uppercase;letter-spacing:.06em}
.dist{display:flex;align-items:flex-end;gap:3px;height:64px;margin-top:6px}
.dist .bar{flex:1;background:var(--ct-surface-3);border-radius:2px 2px 0 0;position:relative;min-height:2px}
.dist .bar.me{background:linear-gradient(180deg,var(--ct-accent-strong),var(--ct-accent-maroon))}
.dist .bar.me::after{content:"BIEN";position:absolute;top:-9px;left:50%;transform:translateX(-50%);
  font-size:5.5px;font-weight:800;letter-spacing:.06em;color:var(--ct-accent-strong);white-space:nowrap}
.distx{display:flex;justify-content:space-between;font-size:5.8px;color:var(--ct-text-faint);
  margin-top:3px;font-variant-numeric:tabular-nums}
.secteur{display:grid;grid-template-rows:auto auto;gap:12px}

/* ---------- table DVF + annonces ---------- */
.two{display:grid;grid-template-columns:1.25fr 1fr;gap:16px;margin-bottom:13px}
.dvf{width:100%;border-collapse:collapse;font-size:8.8px}
.dvf th{font-size:7px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  color:var(--ct-text-muted);text-align:left;padding:0 8px 6px;
  border-bottom:1.6px solid var(--ct-accent-strong)}
.dvf th.r,.dvf td.r{text-align:right}
.dvf tbody tr:nth-child(odd) td{background:var(--ct-surface-1)}
.dvf td{padding:5.5px 8px;border-bottom:1px solid var(--ct-border-soft);color:var(--ct-text-body)}
.dvf tbody tr:last-child td{border-bottom:0}
.dvf .pm{color:var(--ct-accent-strong);font-weight:800;font-variant-numeric:tabular-nums}
.dvf .ty{color:var(--ct-text-strong);font-weight:600}
.dvf .addr{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tnote{font-size:7px;color:var(--ct-text-muted);margin-top:6px;font-variant-numeric:tabular-nums}
.tnote b{color:var(--ct-accent-strong)}
.lst{border-radius:10px;padding:8px 12px;margin-bottom:6px;
  background:linear-gradient(160deg,rgba(255,255,255,.048) 0%,transparent 44%),var(--ct-surface-1);
  border:1px solid var(--ct-border)}
.lst:last-child{margin-bottom:0}
.lst-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.lst-q{font-size:8.5px;font-weight:700;color:var(--ct-text-strong);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lst-q .ap{font-weight:500;color:var(--ct-text-muted);font-size:7px;letter-spacing:.04em}
.lst-px{font-size:13px;font-weight:800;color:var(--ct-accent-strong);
  font-variant-numeric:tabular-nums;letter-spacing:-.01em;white-space:nowrap}
.lst-meta{font-size:8px;color:var(--ct-text-muted);margin-top:3px;font-variant-numeric:tabular-nums}
.lst-meta b{color:var(--ct-text-body);font-weight:600}

/* ---------- stratégies ---------- */
.strat{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:13px}
.stratc{border-radius:14px;padding:14px 16px;position:relative;
  background:linear-gradient(160deg,rgba(255,255,255,.045) 0%,transparent 44%),var(--ct-surface-1);
  border:1px solid var(--ct-border);box-shadow:var(--ct-shadow-depth)}
.stratc.reco{border-color:var(--ct-border-accent);
  background:
    radial-gradient(120% 140% at 100% 0%, color-mix(in srgb,var(--ct-accent-strong) 26%,transparent) 0%, transparent 60%),
    linear-gradient(165deg, color-mix(in srgb,var(--ct-accent-strong) 12%,transparent) 0%, transparent 100%),
    var(--ct-surface-2)}
.stratc h3{font-size:12px;font-weight:800;color:var(--ct-text-strong);letter-spacing:-.01em;margin-bottom:4px}
.stratc .p{font-size:24px;font-weight:800;color:var(--ct-accent-strong);
  font-variant-numeric:tabular-nums;letter-spacing:-.025em;margin:0 0 2px;line-height:1}
.stratc.reco .p{color:var(--ct-text-strong)}
.stratc .sd{font-size:7.5px;color:var(--ct-text-muted);font-weight:700;
  text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.stratc .sd b{color:var(--ct-text-primary);font-weight:800}
.stratc .desc{font-size:8.3px;line-height:1.5;color:var(--ct-text-body);
  border-top:1px solid var(--ct-border-soft);padding-top:7px}
.reco-badge{position:absolute;top:12px;right:14px;font-size:6.5px;font-weight:800;letter-spacing:.12em;
  text-transform:uppercase;color:var(--ct-text-strong);background:var(--ct-accent-strong);
  padding:3px 8px;border-radius:6px;box-shadow:0 2px 10px -2px rgba(225,29,72,.7)}

/* ---------- méthodo + sources ---------- */
.metho{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.metho h3{font-size:8px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ct-accent-strong);margin-bottom:5px}
.metho p{font-size:8.2px;line-height:1.52;color:var(--ct-text-body)}
.metho p b{color:var(--ct-text-strong);font-weight:700}
.sources{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.src{font-size:7.5px;font-weight:600;color:var(--ct-text-body);
  background:var(--ct-surface-2);border:1px solid var(--ct-border);border-radius:6px;padding:3px 8px}
.src b{color:var(--ct-accent-strong);font-weight:800}
.mnote{font-size:7.5px;color:var(--ct-text-muted);margin-top:8px;line-height:1.4}
.mnote b{color:var(--ct-text-primary);font-weight:700}

/* ---------- réserves / mentions (exempté du firewall via .reserves-section) ---------- */
.reserves-section{margin-top:12px;border:1px solid var(--ct-border-accent);
  border-left:3px solid var(--ct-accent-strong);
  background:var(--ct-accent-soft);padding:9px 13px;border-radius:0 10px 10px 0}
.res-title{font-size:7.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ct-accent-strong);margin-bottom:4px}
.reserve-item{display:flex;gap:8px;font-size:7.5px;line-height:1.45;
  color:var(--ct-text-muted);margin-bottom:2px}
.reserve-item:last-child{margin-bottom:0}
.reserve-field{color:var(--ct-text-primary);font-weight:700;white-space:nowrap}
.reserve-note{color:var(--ct-text-muted)}
.disc{font-size:7.5px;line-height:1.5;color:var(--ct-text-muted)}
.disc b{color:var(--ct-text-primary);font-weight:700}

/* ---------- footer ---------- */
.foot{margin-top:auto;padding-top:9px;border-top:1px solid var(--ct-border);display:flex;
  justify-content:space-between;align-items:center;font-size:7.5px;
  color:var(--ct-text-muted);font-weight:500;letter-spacing:.03em}
.foot .fp{font-variant-numeric:tabular-nums}
.foot .fp b{color:var(--ct-accent-strong);font-weight:800}
`;
