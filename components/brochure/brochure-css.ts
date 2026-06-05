// Brochure CSS — isolée du DS Cockpit, autonome, pour export PDF A4
// Typo : Fraunces (display/nombres) + Hanken Grotesk (corps)
// Note 4b/serverless : les Google Fonts sont chargées via <link> (requête réseau).
// Pour un rendu serverless sans réseau (Puppeteer lambda, etc.), il faudra
// embarquer les subsets en base64 @font-face — prévu tranche 4b.

export const BROCHURE_CSS = `
/* ── Reset minimal ─────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Tokens ─────────────────────────────────────────────────────────── */
:root {
  --paper:          #FBFAF7;
  --paper-deep:     #F4F1EA;
  --paper-card:     #FCFBF8;
  --ink:            #1A1A18;
  --ink-soft:       #3A3A36;
  --ink-mute:       #8A857B;
  --ink-faint:      #B4AEA2;
  --hairline:       #E3DED3;
  --hairline-strong:#D6CFBF;
  --accent:         #9A7B4F;
  --accent-deep:    #7C6440;
  --accent-tint:    rgba(154,123,79,.10);

  --serif:  "Fraunces", Georgia, "Times New Roman", serif;
  --sans:   "Hanken Grotesk", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

  /* Print exactness */
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

/* ── Print setup ────────────────────────────────────────────────────── */
@page {
  size: 210mm 297mm;
  margin: 0;
}

/* ── Root container ─────────────────────────────────────────────────── */
html, body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-feature-settings: "ss01","cv05";
}

.brochure-root {
  background: var(--paper);
}

/* ── Sheet / page ───────────────────────────────────────────────────── */
.sheet {
  width: 210mm;
  min-height: 297mm;
  background: var(--paper-card);
  padding: 18mm 17mm 16mm;
  position: relative;
  break-before: page;
  page-break-before: always;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
  overflow: hidden;
}

/* First sheet: no forced page break */
.sheet:first-child {
  break-before: auto;
  page-break-before: auto;
}

/* Cover: full-bleed, no padding */
.sheet.cover {
  padding: 0;
  background: var(--ink);
  color: var(--paper);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 297mm;
}

/* ── Print: avoid breaks inside visual blocks ───────────────────────── */
.card, .figure, .kv, .stat, .value-bar, table, tr,
.strat-grid, .strat-col, .adj-item, .reserve-item {
  break-inside: avoid;
  page-break-inside: avoid;
}

h1, h2, h3 {
  break-after: avoid;
  page-break-after: avoid;
}

thead {
  display: table-header-group;
}

/* ── Typography ─────────────────────────────────────────────────────── */
.serif { font-family: var(--serif); }

.num {
  font-family: var(--serif);
  font-variant-numeric: tabular-nums;
}

.overline {
  font-size: 10px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--ink-mute);
  font-weight: 500;
  font-family: var(--sans);
  font-variant: small-caps;
}

.rule {
  width: 36px;
  height: 1px;
  background: var(--accent);
  border: 0;
  margin: 14px 0;
}

/* ── Cover sheet ────────────────────────────────────────────────────── */
.cover-inner {
  padding: 18mm 17mm 16mm;
  display: flex;
  flex-direction: column;
  height: 297mm;
}

.cover-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.monogram {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(154,123,79,.5);
  color: #C9A871;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--serif);
  font-size: 20px;
  font-weight: 500;
}

.cover-ref {
  text-align: right;
  font-size: 10px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: rgba(251,250,247,.45);
  line-height: 1.9;
}

.cover-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding-bottom: 14mm;
}

.cover-overline {
  font-size: 10px;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: #C9A871;
  font-weight: 500;
  margin-bottom: 24px;
}

.cover-title {
  font-family: var(--serif);
  font-weight: 300;
  font-size: 58px;
  line-height: 1.04;
  letter-spacing: -.02em;
  color: var(--paper);
}

.cover-title em {
  font-style: italic;
  color: #C9A871;
}

.cover-addr {
  margin-top: 22px;
  font-size: 14px;
  color: rgba(251,250,247,.65);
  letter-spacing: .01em;
  line-height: 1.5;
}

.cover-photo {
  width: 100%;
  height: 72mm;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(227,222,211,.12);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14mm;
  position: relative;
  overflow: hidden;
}

.cover-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: .85;
}

.cover-photo-placeholder {
  font-family: var(--serif);
  font-style: italic;
  font-size: 13px;
  color: rgba(251,250,247,.22);
  letter-spacing: .04em;
}

/* ── Section header ─────────────────────────────────────────────────── */
.section-head {
  margin-bottom: 28px;
}

.section-head h2 {
  font-family: var(--serif);
  font-weight: 300;
  font-size: 28px;
  line-height: 1.12;
  letter-spacing: -.015em;
  margin-top: 12px;
  color: var(--ink);
}

/* ── Value hero (Synthèse) ──────────────────────────────────────────── */
.value-bar {
  margin: 10mm 0 8mm;
}

.value-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.value-main .lbl {
  font-size: 10px;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--ink-mute);
  font-weight: 500;
}

.value-main .amt {
  font-family: var(--serif);
  font-weight: 400;
  font-size: 58px;
  line-height: 1;
  letter-spacing: -.015em;
  margin-top: 8px;
  font-variant-numeric: tabular-nums;
}

.value-main .amt .cur {
  font-size: 30px;
  color: var(--ink-soft);
  margin-left: 4px;
}

.value-ppm {
  text-align: right;
}

.value-ppm .v {
  font-family: var(--serif);
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.01em;
}

.value-ppm .k {
  font-size: 11px;
  color: var(--ink-mute);
  margin-top: 4px;
  letter-spacing: .03em;
}

/* Engraved scale — hairline, 3 ticks, 1 laiton dot */
.scale {
  margin-top: 32px;
}

.scale-track {
  position: relative;
  height: 1px;
  background: var(--hairline-strong);
}

.scale-tick {
  position: absolute;
  top: -5px;
  width: 1px;
  height: 11px;
  background: var(--ink-faint);
}

.scale-dot {
  position: absolute;
  top: -4px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  transform: translateX(-50%);
  box-shadow: 0 0 0 4px var(--accent-tint);
}

.scale-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
  font-size: 11px;
  color: var(--ink-mute);
  font-variant-numeric: tabular-nums;
}

.scale-labels .mid {
  color: var(--accent-deep);
  font-weight: 500;
}

/* ── KV spec (Apple style) ──────────────────────────────────────────── */
.kv {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 48px;
  margin-top: 8mm;
}

.kv dl {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 11px 0;
  border-bottom: 1px solid var(--hairline);
  gap: 16px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.kv dt {
  font-size: 12px;
  color: var(--ink-mute);
  letter-spacing: .02em;
}

.kv dd {
  font-size: 13px;
  color: var(--ink);
  text-align: right;
}

/* Strong points */
.strong-points {
  margin-top: 7mm;
}

.strong-points h3 {
  font-family: var(--serif);
  font-weight: 400;
  font-size: 16px;
  letter-spacing: -.01em;
  margin-bottom: 12px;
  color: var(--ink);
}

.strong-point {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--hairline);
  break-inside: avoid;
  page-break-inside: avoid;
}

.strong-point-bullet {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  margin-top: 7px;
}

.strong-point-text {
  font-size: 13px;
  color: var(--ink-soft);
  line-height: 1.55;
}

.strong-point-label {
  font-weight: 500;
  color: var(--ink);
}

/* ── Market stats ───────────────────────────────────────────────────── */
.market-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  border-top: 1px solid var(--hairline);
  margin: 8mm 0;
  break-inside: avoid;
  page-break-inside: avoid;
}

.stat {
  padding: 24px 20px 24px 0;
  border-right: 1px solid var(--hairline);
}

.stat:last-child {
  border-right: 0;
}

.stat .big {
  font-family: var(--serif);
  font-size: 34px;
  font-weight: 400;
  letter-spacing: -.01em;
  font-variant-numeric: tabular-nums;
}

.stat .lbl {
  margin-top: 6px;
  font-size: 11px;
  color: var(--ink-mute);
  letter-spacing: .02em;
  line-height: 1.4;
}

.market-prose {
  font-size: 13.5px;
  color: var(--ink-soft);
  line-height: 1.65;
  max-width: 70ch;
  margin-bottom: 6mm;
}

.market-source {
  font-size: 10px;
  color: var(--ink-faint);
  letter-spacing: .06em;
  margin-top: 6mm;
}

/* ── Tables (DVF / Listings) ────────────────────────────────────────── */
.table-wrap {
  margin-top: 6mm;
  break-inside: avoid;
  page-break-inside: avoid;
}

.table-overline {
  font-size: 10px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--ink-mute);
  font-weight: 500;
  margin-bottom: 14px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead th {
  font-size: 9.5px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--ink-mute);
  font-weight: 500;
  text-align: left;
  padding: 0 0 10px;
  border-bottom: 1px solid var(--hairline-strong);
}

thead th.r, tbody td.r { text-align: right; }

tbody td {
  padding: 12px 0;
  border-bottom: 1px solid var(--hairline);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  break-inside: avoid;
  page-break-inside: avoid;
}

tbody td.addr { color: var(--ink); }
tbody td.muted { color: var(--ink-mute); }

/* ── Adjustments ────────────────────────────────────────────────────── */
.adj-list {
  margin-top: 6mm;
}

.adj-item {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  gap: 0 14px;
  padding: 13px 0;
  border-bottom: 1px solid var(--hairline);
  align-items: baseline;
  break-inside: avoid;
  page-break-inside: avoid;
}

.adj-sign {
  font-family: var(--serif);
  font-size: 16px;
  font-weight: 400;
  color: var(--accent);
  text-align: center;
  line-height: 1.3;
}

.adj-body {}

.adj-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
}

.adj-rationale {
  font-size: 11.5px;
  color: var(--ink-mute);
  margin-top: 3px;
  line-height: 1.5;
}

.adj-pct {
  font-family: var(--serif);
  font-size: 14px;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── Conclusion / Fourchette ────────────────────────────────────────── */
.fourchette {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  border: 1px solid var(--hairline);
  margin: 8mm 0;
  break-inside: avoid;
  page-break-inside: avoid;
}

.fourchette .fk {
  padding: 22px 24px;
  border-right: 1px solid var(--hairline);
}

.fourchette .fk:last-child {
  border-right: 0;
}

.fk .lbl {
  font-size: 10px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ink-mute);
  font-weight: 500;
}

.fk .val {
  font-family: var(--serif);
  font-size: 22px;
  font-weight: 400;
  margin-top: 10px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.01em;
}

.fk.mid .lbl { color: var(--accent-deep); }
.fk.mid .val { font-size: 28px; }

.listing-price {
  background: var(--ink);
  color: var(--paper);
  padding: 22px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  break-inside: avoid;
  page-break-inside: avoid;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

.listing-price .lp-label {
  font-size: 10px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: rgba(251,250,247,.55);
  font-weight: 500;
}

.listing-price .lp-val {
  font-family: var(--serif);
  font-size: 28px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.01em;
  margin-top: 6px;
}

/* Strategies */
.strat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border: 1px solid var(--hairline);
  margin-top: 6mm;
  break-inside: avoid;
  page-break-inside: avoid;
}

.strat-col {
  padding: 24px 26px;
}

.strat-col:first-child {
  border-right: 1px solid var(--hairline);
}

.strat-k {
  font-size: 10px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--accent-deep);
  font-weight: 500;
}

.strat-d {
  font-size: 12.5px;
  color: var(--ink-soft);
  margin-top: 8px;
  line-height: 1.55;
}

/* ── Réserves (annexe §9) ────────────────────────────────────────────── */
.reserves-section {
  border-top: 1px solid var(--hairline);
  padding-top: 8mm;
  margin-top: 8mm;
}

.reserves-section .res-title {
  font-size: 10px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ink-faint);
  font-weight: 500;
  margin-bottom: 12px;
}

.reserve-item {
  display: flex;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--hairline);
  break-inside: avoid;
  page-break-inside: avoid;
}

.reserve-field {
  font-size: 11px;
  color: var(--ink-mute);
  font-weight: 500;
  min-width: 36mm;
}

.reserve-note {
  font-size: 11px;
  color: var(--ink-faint);
}
`;
