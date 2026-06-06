// Brochure.tsx — Server-safe (pas de 'use client', pas de hooks).
// Avis de valeur PDF — Design System Cockpit (verre bordeaux), 2 PAGES strict.
// Toutes les données proviennent de l'estimation réelle (aucune valeur en dur).
// La carte du mockup est remplacée par une viz data-driven (distribution €/m² +
// positionnement) car le contrat de données ne porte pas de coordonnées géo.
// Conformité firewall : aucune des chaînes interdites dans les sections 1-8 ;
// les mentions légales / réserves vivent dans .reserves-section (exemptée).

import React from 'react';
import type {
  Estimation,
  ValuationAdjustment,
  DvfComparable,
  ListingComparable,
  PropertyData,
} from '@/lib/estimation/types';

// ── Formatage ────────────────────────────────────────────────────────────────

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

function formatEUR(n: number): string {
  return `${nf0.format(Math.round(n))} €`;
}
function formatK(n: number): string {
  return `${nf0.format(Math.round(n / 1000))} k€`;
}
function formatM2(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${nf0.format(n)} m²`;
}
function formatPpm2(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${nf0.format(Math.round(n))} €/m²`;
}

function labelTypeBien(t: PropertyData['type_bien']): string {
  const map: Record<NonNullable<PropertyData['type_bien']>, string> = {
    appartement: 'Appartement', maison: 'Maison', immeuble: 'Immeuble',
    local_commercial: 'Local commercial', terrain: 'Terrain', autre: 'Bien',
  };
  return t ? map[t] : 'Bien';
}
function labelExposition(e: PropertyData['exposition']): string {
  if (!e) return '—';
  const map: Record<NonNullable<PropertyData['exposition']>, string> = {
    nord: 'Nord', sud: 'Sud', est: 'Est', ouest: 'Ouest',
    sud_est: 'Sud-Est', sud_ouest: 'Sud-Ouest',
    nord_est: 'Nord-Est', nord_ouest: 'Nord-Ouest', traversant: 'Traversant',
  };
  return map[e];
}
function labelEtat(e: PropertyData['etat_general']): string {
  if (!e) return '—';
  const map: Record<NonNullable<PropertyData['etat_general']>, string> = {
    a_renover: 'À rénover', rafraichissement: 'Rafraîchissement',
    bon: 'Bon état', renove_recemment: 'Rénové récemment', neuf: 'Neuf',
  };
  return map[e];
}
function labelStationnement(s: PropertyData['stationnement']): string {
  if (!s) return '—';
  const map: Record<NonNullable<PropertyData['stationnement']>, string> = {
    aucun: 'Aucun', place_exterieure: 'Place extérieure',
    place_sous_sol: 'Place sous-sol', box: 'Box', garage: 'Garage',
    plusieurs: 'Plusieurs',
  };
  return map[s];
}
function labelTendance(t: 'hausse' | 'stable' | 'baisse'): string {
  return t === 'hausse' ? 'En hausse' : t === 'baisse' ? 'En repli' : 'Stable';
}

/** Position 0–100 d'une valeur dans [low, high]. */
function scalePct(low: number, v: number, high: number): number {
  const range = high - low;
  if (range <= 0) return 50;
  return Math.max(0, Math.min(100, Math.round(((v - low) / range) * 100)));
}

/** Percentile (0–100) d'une valeur dans une série. */
function percentileOf(v: number, values: number[]): number {
  const a = values.filter((x) => x > 0);
  if (a.length === 0) return 50;
  const below = a.filter((x) => x <= v).length;
  return Math.max(2, Math.min(98, Math.round((below / a.length) * 100)));
}

type Bucket = { pct: number; me: boolean; lo: number };

/** Histogramme €/m² (6 tranches) à partir des comparables, tranche du bien marquée. */
function computeDistribution(
  prices: number[],
  subject: number
): { buckets: Bucket[] } | null {
  const N = 6;
  const valid = prices.filter((p) => p > 500 && p < 50000).sort((a, b) => a - b);
  if (valid.length < 3) return null;
  const min = valid[0];
  const max = valid[valid.length - 1];
  const width = Math.max(1, (max - min) / N);
  const counts = new Array<number>(N).fill(0);
  for (const p of valid) {
    const idx = Math.max(0, Math.min(N - 1, Math.floor((p - min) / width)));
    counts[idx] += 1;
  }
  const subjIdx = Math.max(0, Math.min(N - 1, Math.floor((subject - min) / width)));
  const maxCount = Math.max(...counts, 1);
  const buckets: Bucket[] = counts.map((c, i) => ({
    pct: Math.max(c > 0 ? 14 : 4, Math.round((c / maxCount) * 100)),
    me: i === subjIdx,
    lo: Math.round(min + i * width),
  }));
  return { buckets };
}

function getToConfirmFields(estimation: Estimation): string[] {
  const LABELS: Partial<Record<keyof PropertyData, string>> = {
    surface_habitable_m2: 'Surface habitable', surface_carrez_m2: 'Surface Carrez',
    etage: 'Étage', nombre_pieces: 'Nombre de pièces', nombre_chambres: 'Chambres',
    dpe_classe: 'Classe DPE', ges_classe: 'Classe GES', etat_general: 'État général',
    exposition: 'Exposition', terrasse_balcon_m2: 'Terrasse / balcon', jardin_m2: 'Jardin',
    charges_annuelles_eur: 'Charges annuelles', travaux_votes: 'Travaux votés',
    stationnement: 'Stationnement', occupation: 'Occupation',
  };
  const out: string[] = [];
  for (const [field, status] of Object.entries(estimation.fieldStatus)) {
    if (status === 'to_confirm') out.push(LABELS[field as keyof PropertyData] ?? field);
  }
  return out;
}

function frenchDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch {
    return iso;
  }
}
function refCode(estimation: Estimation): string {
  const year = (() => {
    try { return new Date(estimation.createdAt).getFullYear(); } catch { return 2026; }
  })();
  const tail = estimation.id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase();
  return `EV-${year}-${tail}`;
}

// ── Briques ──────────────────────────────────────────────────────────────────

function RunningHead({
  brand, mono, right,
}: { brand: string; mono: string; right: React.ReactNode }): React.JSX.Element {
  return (
    <header className="rhead">
      <div className="brand">
        <span className="mono">{mono}</span>
        <span className="bn"><b>{brand}</b><i>Avis de valeur</i></span>
      </div>
      <div className="rmeta">{right}</div>
    </header>
  );
}

function Eyebrow({ n, tx }: { n: string; tx: string }): React.JSX.Element {
  return (
    <div className="eb">
      <span className="n">{n}</span>
      <span className="tx">{tx}</span>
      <span className="ln" />
    </div>
  );
}

function Foot({ ref_, date, page }: { ref_: string; date: string; page: number }): React.JSX.Element {
  return (
    <footer className="foot">
      <span>Real Estate Agent — Avis de valeur · {ref_} · Établi le {date}</span>
      <span className="fp">Page <b>{page}</b> / 2</span>
    </footer>
  );
}

// ── Page 1 ───────────────────────────────────────────────────────────────────

function PageOne({ estimation }: { estimation: Estimation }): React.JSX.Element {
  const { property, valuation, market, branding } = estimation;
  const v = valuation!; // garanti par le caller (status ready)
  const mono = (branding?.monogram as string | undefined) ?? 'R';
  const brand = (branding?.name as string | undefined) ?? 'Real Estate Agent';
  const ref_ = refCode(estimation);
  const date = frenchDate(estimation.updatedAt);

  const surface = property.surface_carrez_m2 ?? property.surface_habitable_m2 ?? null;
  const titleMain =
    `${labelTypeBien(property.type_bien)}` +
    (property.nombre_pieces != null ? ` ${property.nombre_pieces} pièces` : '') +
    (property.vue ? `, ${property.vue}` : '');
  const addrLine = property.adresse ?? property.ville ?? 'Adresse non renseignée';
  const addrSub = [
    [property.code_postal, property.ville].filter(Boolean).join(' '),
    property.secteur ?? null,
  ].filter(Boolean).join(' · ');

  const chips: React.ReactNode[] = [
    surface != null ? <span className="chip num" key="s">{formatM2(surface)}</span> : null,
    property.nombre_pieces != null ? <span className="chip" key="p">{property.nombre_pieces} pièces</span> : null,
    property.etage != null ? <span className="chip num" key="e">{property.etage}ᵉ étage</span> : null,
    property.dpe_classe ? <span className="chip" key="d">DPE <b>{property.dpe_classe}</b></span> : null,
    property.terrasse_balcon_m2 != null ? <span className="chip num" key="t">Terrasse {formatM2(property.terrasse_balcon_m2)}</span> : null,
    property.exposition ? <span className="chip" key="x">{labelExposition(property.exposition)}</span> : null,
  ].filter(Boolean);

  const curPct = scalePct(v.lowValue, v.marketValue, v.highValue);
  const recoPct = scalePct(v.lowValue, v.recommendedListingPrice, v.highValue);

  // Specs (lignes disponibles uniquement)
  const specRows: Array<[string, React.ReactNode]> = [];
  if (property.type_bien) specRows.push(['Type', labelTypeBien(property.type_bien)]);
  if (surface != null) specRows.push(['Surface', <span className="num" key="v">{formatM2(surface)}</span>]);
  if (property.nombre_pieces != null) {
    specRows.push(['Pièces / ch.', <span className="num" key="v">{property.nombre_pieces}{property.nombre_chambres != null ? ` / ${property.nombre_chambres}` : ''}</span>]);
  }
  if (property.etage != null) specRows.push(['Étage', <span className="num" key="v">{property.etage}ᵉ{property.nb_etages_total != null ? ` / ${property.nb_etages_total}` : ''}</span>]);
  if (property.ascenseur != null) specRows.push(['Ascenseur', property.ascenseur ? 'Oui' : 'Non']);
  if (property.exposition) specRows.push(['Exposition', labelExposition(property.exposition)]);
  if (property.terrasse_balcon_m2 != null) specRows.push(['Terrasse', <span className="num" key="v">{formatM2(property.terrasse_balcon_m2)}</span>]);
  if (property.jardin_m2 != null) specRows.push(['Jardin', <span className="num" key="v">{formatM2(property.jardin_m2)}</span>]);
  if (property.stationnement && property.stationnement !== 'aucun') specRows.push(['Stationnement', labelStationnement(property.stationnement)]);
  if (property.vue) specRows.push(['Vue', property.vue]);
  if (property.dpe_classe) specRows.push(['DPE / GES', <b key="v"><em>{property.dpe_classe}</em>{property.ges_classe ? ` / ${property.ges_classe}` : ''}</b>]);
  if (property.etat_general) specRows.push(['État', labelEtat(property.etat_general)]);
  if (property.charges_annuelles_eur != null) specRows.push(['Charges / an', <span className="num" key="v">{formatEUR(property.charges_annuelles_eur)}</span>]);
  const specsShown = specRows.slice(0, 12);

  // Lecture de l'expert (depuis les ajustements)
  const adj: ValuationAdjustment[] = v.adjustments ?? [];
  const premiums = adj.filter((a) => a.type === 'premium');
  const discounts = adj.filter((a) => a.type === 'discount');
  const expertParts: string[] = [];
  if (premiums.length) expertParts.push(`Atouts retenus : ${premiums.map((p) => p.label.toLowerCase()).join(', ')}.`);
  if (discounts.length) expertParts.push(`Éléments de décote : ${discounts.map((p) => p.label.toLowerCase()).join(', ')}.`);
  const expertText =
    expertParts.join(' ') ||
    `Le bien est positionné par rapport aux ventes réelles du secteur, ajusté selon ses caractéristiques propres (surface, étage, exposition et prestations).`;

  // Distribution + positionnement (data-driven, remplace la carte)
  const prices = (market?.dvf_comparables ?? []).map((c) => c.prix_m2);
  const dist = computeDistribution(prices, v.adjustedPerM2);
  const pct = percentileOf(v.adjustedPerM2, prices);
  const posTier = pct >= 66 ? 'tiers supérieur' : pct >= 33 ? 'milieu de marché' : 'tiers inférieur';

  return (
    <section className="page">
      <RunningHead brand={brand} mono={mono} right={
        <>
          <span>Réf. {ref_}</span><span className="sep">·</span>
          <span className="num">{date}</span><span className="sep">·</span>
          <span className="conf">Confidentiel</span>
        </>
      } />

      <div className="hero">
        <div className="hero-l">
          <div className="kdoc">Avis de valeur vénale · {labelTypeBien(property.type_bien)}</div>
          <h1>{titleMain}<br /><span className="addr-line">{addrLine}</span></h1>
          {addrSub && <div className="addr">{addrSub}</div>}
          {chips.length > 0 && <div className="chips">{chips}</div>}
        </div>

        <aside className="valuebox">
          <div className="vb-lab">Valeur vénale estimée</div>
          <div className="bigval num">{nf0.format(Math.round(v.marketValue))}<span className="cur"> €</span></div>
          <div className="vb-range">
            <div className="vr-row"><span>Fourchette d&apos;estimation</span><span className="num">{formatK(v.lowValue)} – {formatK(v.highValue)}</span></div>
            <div className="rangebar"><i className="rb-cur" style={{ left: `${curPct}%` }} /><i className="rb-reco" style={{ left: `${recoPct}%` }} /></div>
            <div className="vr-foot"><span>{formatK(v.lowValue)}</span><span className="reco-tag">● Conseillé · {formatEUR(v.recommendedListingPrice)}</span><span>{formatK(v.highValue)}</span></div>
          </div>
          <div className="vmeta">
            <div><span className="vm-l">Prix conseillé</span><span className="vm-v num">{formatEUR(v.recommendedListingPrice)}</span></div>
            <div><span className="vm-l">Prix au m²</span><span className="vm-v num">{formatPpm2(v.adjustedPerM2)}</span></div>
            <div><span className="vm-l">Comparables</span><span className="vm-v num">{v.nbComparables}</span></div>
            <div><span className="vm-l">Délai marché</span><span className="vm-v num">{market?.delai_moyen_vente_jours != null ? `${market.delai_moyen_vente_jours} j` : '—'}</span></div>
          </div>
        </aside>
      </div>

      {market && (
        <div className="kpis">
          <div className="kpi"><span className="kl">Prix médian / m²</span><span className="kv num">{formatPpm2(market.prix_median_m2)}</span><span className="kd">Ventes réelles du secteur</span></div>
          <div className="kpi"><span className="kl">Tendance</span><span className={`kv${market.tendance === 'hausse' ? ' up' : ''}`}>{labelTendance(market.tendance)}</span><span className="kd">Marché local · 12 mois</span></div>
          <div className="kpi"><span className="kl">Transactions / 12 m</span><span className="kv num">{market.nb_transactions_12m}</span><span className="kd">{market.zone}</span></div>
          <div className="kpi"><span className="kl">Prix moyen / m²</span><span className="kv num">{formatPpm2(market.prix_moyen_m2)}</span><span className="kd">Secteur analysé</span></div>
        </div>
      )}

      <Eyebrow n="01" tx="Positionnement dans le secteur" />
      <div className="split">
        <div className="secteur">
          <div className="panel">
            <div className="pt">Distribution €/m²</div>
            <div className="ps">{market ? `${market.dvf_comparables.length} comparables · ventes réelles` : 'Comparables indisponibles'}</div>
            {dist ? (
              <>
                <div className="dist">
                  {dist.buckets.map((b, i) => (
                    <div className={`bar${b.me ? ' me' : ''}`} style={{ height: `${b.pct}%` }} key={i} />
                  ))}
                </div>
                <div className="distx">
                  {dist.buckets.map((b, i) => (
                    <span key={i}>{(b.lo / 1000).toFixed(1)}k</span>
                  ))}
                </div>
                <div className="psum">Le bien (<b>{formatPpm2(v.adjustedPerM2)}</b>) se situe dans le <b>{posTier}</b> de la distribution des prix observés.</div>
              </>
            ) : (
              <div className="psum">Distribution indisponible — comparables insuffisants pour ce secteur.</div>
            )}
          </div>

          <div className="panel">
            <div className="pt">Positionnement du bien</div>
            <div className="ps">vs marché local (€/m²)</div>
            <div className="posbar"><i style={{ left: `${pct}%` }} /></div>
            <div className="posax"><span>Bas</span><span>Médian</span><span>Haut</span></div>
            <div className="psum">Positionné au <b>{pct}ᵉ</b> centile €/m² du secteur, soit le <b>{posTier}</b> du marché.</div>
          </div>
        </div>

        <div className="sidecol">
          <div className="specs">
            {specsShown.map(([k, val], i) => (
              <div className="srow" key={i}><span>{k}</span><b>{val}</b></div>
            ))}
          </div>

          <div className="expert">
            <h3>Lecture de l&apos;expert</h3>
            <p>{expertText}</p>
          </div>

          <div className="dvfnote">
            <h4>Comment la valeur est calculée</h4>
            <p>Les <b>ventes réelles DVF</b> (données de l&apos;État, géocodées <b>BAN + cadastre IGN</b>) constituent le socle du calcul. Les <b>annonces</b> du marché actif complètent l&apos;analyse concurrentielle. <i>Aucune donnée Google Maps n&apos;est utilisée.</i></p>
          </div>
        </div>
      </div>

      <Foot ref_={ref_} date={date} page={1} />
    </section>
  );
}

// ── Page 2 ───────────────────────────────────────────────────────────────────

function PageTwo({ estimation }: { estimation: Estimation }): React.JSX.Element {
  const { property, valuation, market, branding, saleStrategies } = estimation;
  const v = valuation!;
  const mono = (branding?.monogram as string | undefined) ?? 'R';
  const brand = (branding?.name as string | undefined) ?? 'Real Estate Agent';
  const ref_ = refCode(estimation);
  const date = frenchDate(estimation.updatedAt);

  const dvf: DvfComparable[] = (market?.dvf_comparables ?? []).slice(0, 6);
  const listings: ListingComparable[] = (market?.listing_comparables ?? []).slice(0, 3);
  const sourceLabel = market?.listing_source?.source === 'apify' ? 'LeBonCoin'
    : market?.listing_source?.source === 'myswarms' ? 'Bienici' : 'marché actif';

  const strat = saleStrategies ?? [];
  const stratRapide = strat[0] ?? 'Prix d’appel positionné pour déclencher une décision rapide et maximiser la liquidité.';
  const stratValo = strat[1] ?? 'Prix aligné sur le haut de fourchette, soutenu par les atouts du bien, pour capter la pleine valeur.';

  const toConfirm = getToConfirmFields(estimation);

  return (
    <section className="page">
      <RunningHead brand={brand} mono={mono} right={
        <>
          <span>{property.adresse ?? property.ville ?? '—'}</span><span className="sep">·</span>
          <span>Réf. {ref_}</span><span className="sep">·</span>
          <span className="conf">Confidentiel</span>
        </>
      } />

      <Eyebrow n="02" tx="Comparables réels & marché actif" />
      <div className="two">
        <div className="dvfblock">
          <table className="dvf">
            <thead><tr><th>Date</th><th>Type</th><th className="r">Surface</th><th className="r">Prix</th><th className="r">€/m²</th></tr></thead>
            <tbody>
              {dvf.map((c) => (
                <tr key={c.id}>
                  <td className="num">{(() => { try { const d = new Date(c.date_mutation); return `${String(d.getMonth() + 1).padStart(2, '0')} / ${String(d.getFullYear()).slice(2)}`; } catch { return c.date_mutation; } })()}</td>
                  <td className="ty">{c.nombre_pieces != null ? `${c.nombre_pieces} p.` : c.type_local}</td>
                  <td className="r num">{formatM2(c.surface_reelle_bati)}</td>
                  <td className="r num">{formatEUR(c.valeur_fonciere)}</td>
                  <td className="r num pm">{nf0.format(Math.round(c.prix_m2))}</td>
                </tr>
              ))}
              {dvf.length === 0 && (
                <tr><td colSpan={5} className="muted">Aucune vente comparable disponible pour ce secteur.</td></tr>
              )}
            </tbody>
          </table>
          {market && market.nb_transactions_12m > 0 && (
            <p className="tnote"><b>{market.nb_transactions_12m} ventes</b> analysées · DVF Etalab · géolocalisées</p>
          )}
        </div>

        <div className="lstblock">
          {listings.length > 0 ? (
            <>
              {listings.map((l) => (
                <div className="lst" key={l.id}>
                  <div className="lst-top">
                    <span className="lst-q">{l.titre}{l.nb_pieces != null ? <span className="ap"> · T{l.nb_pieces}</span> : null}</span>
                    <span className="lst-px num">{formatEUR(l.prix)}</span>
                  </div>
                  <div className="lst-meta"><b className="num">{formatM2(l.surface_m2)}</b> · <span className="num">{formatPpm2(l.prix_m2)}</span>{l.nb_pieces != null ? ` · ${l.nb_pieces} pièces` : ''}</div>
                </div>
              ))}
              <p className="tnote"><b>{(market?.listing_comparables ?? []).length} annonces</b> détectées ({sourceLabel}) · ≈ quartier</p>
            </>
          ) : (
            <div className="lst"><div className="lst-meta">Aucune annonce concurrente détectée à proximité au moment de l&apos;analyse.</div></div>
          )}
        </div>
      </div>

      <Eyebrow n="03" tx="Stratégies de mise en vente" />
      <div className="strat">
        <div className="stratc">
          <h3>Vente rapide</h3>
          <div className="p num">{formatEUR(v.marketValue)}</div>
          <div className="sd">Aligné sur la <b>valeur de marché</b></div>
          <p className="desc">{stratRapide}</p>
        </div>
        <div className="stratc reco">
          <span className="reco-badge">Conseillé</span>
          <h3>Valorisation</h3>
          <div className="p num">{formatEUR(v.recommendedListingPrice)}</div>
          <div className="sd">Prix de <b>mise en vente conseillé</b></div>
          <p className="desc">{stratValo}</p>
        </div>
      </div>

      <Eyebrow n="04" tx="Méthodologie & sources" />
      <div className="metho">
        <div>
          <h3>Méthode de calcul</h3>
          <p>Géocodage de l&apos;adresse via la <b>Base Adresse Nationale</b>, résolution de la parcelle au <b>cadastre IGN</b>, puis extraction des <b>ventes réelles DVF</b> (Etalab). La valeur résulte de la <b>médiane €/m²</b> des comparables (type, surface et période proches), ajustée selon DPE, étage, exposition et prestations. La fourchette est calibrée sur la dispersion des comparables retenus.</p>
        </div>
        <div>
          <h3>Sources & données</h3>
          <div className="sources">
            <span className="src"><b>BAN</b> · géocodage</span>
            <span className="src"><b>IGN</b> · cadastre</span>
            <span className="src"><b>DVF Etalab</b> · ventes</span>
            <span className="src"><b>ADEME</b> · DPE</span>
            <span className="src"><b>{sourceLabel}</b> · marché actif</span>
          </div>
          <p className="mnote">Sources publiques officielles françaises. <b>Aucune donnée Google Maps n&apos;est utilisée.</b></p>
        </div>
      </div>

      {/* §Réserves & mentions — exempté du firewall (.reserves-section) */}
      <div className="reserves-section">
        <div className="res-title">Mentions & réserves</div>
        <p className="disc"><b>Avis de valeur indicatif.</b> Ce document constitue une estimation fondée sur des données de marché et ne saurait être assimilé à une expertise immobilière au sens réglementaire. Il n&apos;engage pas son émetteur, ne préjuge pas du prix de transaction effectif et exclut les frais d&apos;acquisition. Établi le {date} — valable 6 mois.</p>
        {toConfirm.length > 0 && (
          <div className="reserve-item" style={{ marginTop: '6px' }}>
            <span className="reserve-field">Données à confirmer :</span>
            <span className="reserve-note">{toConfirm.join(' · ')}.</span>
          </div>
        )}
      </div>

      <Foot ref_={ref_} date={date} page={2} />
    </section>
  );
}

// ── Composant principal ──────────────────────────────────────────────────────

export function Brochure({ estimation }: { estimation: Estimation }): React.JSX.Element {
  // Le PDF n'est généré qu'à l'état "ready" (valuation présente). Garde-fou :
  if (!estimation.valuation) {
    return (
      <section className="page">
        <div className="expert"><p>Estimation en cours de finalisation.</p></div>
      </section>
    );
  }
  return (
    <>
      <PageOne estimation={estimation} />
      <PageTwo estimation={estimation} />
    </>
  );
}
