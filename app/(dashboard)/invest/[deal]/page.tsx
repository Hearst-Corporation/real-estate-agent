/**
 * FICHE DEAL — l'écran central (étude P7 + 11 graphiques P8). RSC.
 *
 * Anti-FIA matérialisé :
 *   - L4 : <LegalNatureBadge> permanent en tête (créancier ≠ propriétaire).
 *   - L5 : scénarios (pessimiste toujours visible) + "cible · non garanti".
 *   - L3 : bloc de souscription = "Réserver ma place" (réservation non
 *     engageante · sans versement · révocable), JAMAIS "Investir"/"Payer".
 *   - L6 : séquestre tiers nommé.
 *   - Token : "minté au closing", miroir DEEP, EUR par défaut (jamais USDT).
 *
 * Tous les chiffres viennent de `buildDealSheet` (moteur financier).
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { Donut } from "@/components/cockpit/Donut";
import { BarList } from "@/components/cockpit/BarList";
import {
  LegalNatureBadge,
  ProductBadges,
  StatusPill,
  Stepper,
  Waterfall,
  Gauge,
  RiskRadar,
  ScenarioBars,
  SensitivityCurve,
  Timeline,
  Banner,
  eur,
  pct,
} from "@/components/invest";
import { getDemoDeal, DEMO_DEALS } from "../_data/demo";

/** Carte de chart (wrapper local, tokens --ct-*). */
function ChartCard({
  title,
  span = 6,
  foot,
  children,
}: {
  title: string;
  span?: 12 | 8 | 6 | 4 | 3;
  foot?: string;
  children: ReactNode;
}) {
  return (
    <div className={`inv-chart-card inv-col-${span}`}>
      <div className="inv-chart-head">
        <span className="inv-chart-title">{title}</span>
      </div>
      {children}
      {foot ? <p className="inv-chart-foot">{foot}</p> : null}
    </div>
  );
}

// Pré-génère les routes de démo (SSG).
export function generateStaticParams() {
  return DEMO_DEALS.map((d) => ({ deal: d.slug }));
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ deal: string }>;
}) {
  const { deal: slug } = await params;
  const deal = getDemoDeal(slug);
  if (!deal) notFound();

  const { sheet } = deal;
  const { charts, metrics } = sheet;
  const taux = deal.objectifEur > 0 ? Math.round((deal.collecteEur / deal.objectifEur) * 100) : 0;

  // Use of funds → items BarList (réutilise le composant Cockpit existant).
  const useOfFunds = charts.g2_use_of_funds.segments.map((s) => ({
    label: s.label,
    value: eur(s.valeur_eur),
    percent: s.part * 100,
  }));

  // Sûretés (présentation P11).
  const suretes = [
    "Hypothèque 1er rang (banque)",
    "Nantissement des titres de la SPV",
    "GAPD du sponsor",
    "Assurance dommages-ouvrage",
  ];

  // Closing (timeline de démo — séquence séquestre → DEEP → mint → lock-up).
  const closing = [
    { title: "Déblocage du séquestre vers la SAS", sub: "À l'atteinte de l'objectif + prêt accordé", state: "todo" as const },
    { title: "Inscription au registre légal (DEEP)", sub: "Source de vérité légale", state: "todo" as const },
    { title: "Mint du token ERC-3643 sur votre coffre", sub: "Miroir on-chain, après le DEEP", state: "todo" as const },
    { title: "Lock-up activé jusqu'à l'exit", sub: "Titres illiquides pendant l'opération", state: "todo" as const },
  ];

  return (
    <div className="ct-page-area">
      <Link href="/invest" className="inv-deal-loc" style={{ marginBottom: "var(--ct-space-md)" }}>
        ‹ Opportunités
      </Link>

      {/* HERO + bloc souscription */}
      <div className="inv-detail-head">
        <div className="inv-detail-hero">
          <div className="inv-detail-hero-inner">
            <div className="inv-detail-loc">{deal.input.localisation}</div>
            <h1 className="inv-detail-name">{deal.input.nom}</h1>
            <ProductBadges badges={deal.badges} />
          </div>
        </div>

        <div className="inv-detail-side">
          <div className="inv-raise-box">
            <div className="inv-raise-amt">
              <span className="inv-big">{eur(deal.collecteEur)}</span>
              <span className="inv-goal">/ {eur(deal.objectifEur)} objectif</span>
            </div>
            <div className="inv-progress-track" role="progressbar" aria-valuenow={taux} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement de la levée">
              <div className="inv-progress-fill" style={{ width: `${Math.min(100, taux)}%` }} />
            </div>
            <div className="inv-raise-stats">
              <div className="inv-raise-stat">
                <span className="inv-v">{pct(sheet.rendement_cible_irr)}</span>
                <span className="inv-l">TRI cible · non gar.</span>
              </div>
              <div className="inv-raise-stat">
                <span className="inv-v">{pct(metrics.ltv)}</span>
                <span className="inv-l">LTV</span>
              </div>
              <div className="inv-raise-stat">
                <span className="inv-v">{deal.input.schedule.duree_mois} m</span>
                <span className="inv-l">Durée</span>
              </div>
            </div>
            <div className="inv-raise-stats">
              <div className="inv-raise-stat">
                <span className="inv-v">{eur(deal.input.ticket_min_eur ?? 1000)}</span>
                <span className="inv-l">Ticket min</span>
              </div>
              <div className="inv-raise-stat">
                <span className="inv-v">{eur(deal.input.ticket_max_eur ?? 100000)}</span>
                <span className="inv-l">Ticket max</span>
              </div>
              <div className="inv-raise-stat">
                <span className="inv-v">{taux}%</span>
                <span className="inv-l">Levé</span>
              </div>
            </div>
            <button className="inv-btn-reserve" type="button">
              Réserver ma place
            </button>
            <p className="inv-reserve-note">Réservation non engageante · sans versement · révocable</p>
          </div>
          <StatusPill tone={deal.statusTone}>{deal.statusLabel}</StatusPill>
        </div>
      </div>

      {/* L4 — nature juridique permanente */}
      <div style={{ marginBottom: "var(--ct-space-lg)" }}>
        <LegalNatureBadge sasName={deal.sasName} />
      </div>

      {/* Funnel de souscription (aperçu des 4 étapes) */}
      <div className="inv-chart-card" style={{ marginBottom: "var(--ct-space-lg)" }}>
        <div className="inv-chart-head">
          <span className="inv-chart-title">Souscription — 4 étapes</span>
        </div>
        <Stepper
          current={0}
          steps={[{ label: "Montant" }, { label: "Éligibilité" }, { label: "Signature" }, { label: "Versement" }]}
        />
        <p className="inv-chart-foot">
          Étape 1 = réservation non engageante (aucun versement). Le versement va vers un séquestre
          tiers : {deal.sequestre}. La plateforme ne détient jamais vos fonds ; remboursement intégral
          si le deal n’aboutit pas.
        </p>
      </div>

      {/* Warnings du moteur (cohérence — affichés honnêtement) */}
      {sheet.warnings.length > 0 ? (
        <div style={{ marginBottom: "var(--ct-space-lg)" }}>
          <Banner tone="warn">
            <b>Points d’attention :</b>
            <ul style={{ margin: "var(--ct-space-2xs) 0 0", paddingLeft: "var(--ct-space-md)" }}>
              {sheet.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </Banner>
        </div>
      ) : null}

      {/* KPI économie de l'opération */}
      <div className="ct-kpi-grid cols-4">
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">Coût total projet</div>
          <div className="ct-kpi-value">{eur(metrics.cout_total_eur)}</div>
        </div>
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">Dette senior</div>
          <div className="ct-kpi-value">{eur(deal.input.funding.dette_senior_eur)}</div>
        </div>
        <div className="ct-kpi-card accent">
          <div className="ct-kpi-label">Obligations (vous)</div>
          <div className="ct-kpi-value">{eur(deal.input.funding.obligations_cible_eur)}</div>
        </div>
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">Equity sponsor</div>
          <div className="ct-kpi-value">{eur(deal.input.funding.equity_sponsor_eur)}</div>
        </div>
      </div>

      {/* Les 11 graphiques (P8) */}
      <div className="inv-chart-grid">
        {/* G1 — Répartition dette/equity (donut existant) */}
        <ChartCard title="Répartition dette / equity" span={4} foot={charts.g1_dette_equity.interpretation}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--ct-space-md)" }}>
            <Donut value={deal.input.funding.obligations_cible_eur / charts.g1_dette_equity.total_eur * 100} centerLabel={pct(deal.input.funding.obligations_cible_eur / charts.g1_dette_equity.total_eur)} sublabel="Obligations" accent />
          </div>
          <div className="inv-legend">
            {charts.g1_dette_equity.segments.map((s) => (
              <div className="inv-legend-row" key={s.key}>
                <span className="inv-legend-lab">{s.label}</span>
                <span className="inv-legend-val">{pct(s.part)}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* G2 — Use of funds (BarList existant) */}
        <ChartCard title="Use of funds" span={8} foot={charts.g2_use_of_funds.interpretation}>
          <BarList items={useOfFunds} emptyLabel="Aucun poste." />
        </ChartCard>

        {/* G3 — Waterfall */}
        <ChartCard title="Waterfall de distribution (scénario central)" span={12} foot={charts.g3_waterfall.interpretation}>
          <Waterfall chart={charts.g3_waterfall} />
        </ChartCard>

        {/* G5 — Scénarios */}
        <ChartCard title="Scénarios (TRI cible · non garanti)" span={6} foot={charts.g5_scenarios.interpretation}>
          <ScenarioBars chart={charts.g5_scenarios} />
        </ChartCard>

        {/* G10 — LTV gauge */}
        <ChartCard title="LTV (dette / valeur)" span={6} foot={charts.g10_ltv.interpretation}>
          <Gauge chart={charts.g10_ltv} />
        </ChartCard>

        {/* G6 — Sensibilité prix */}
        <ChartCard title="Sensibilité : prix de revente → rendement" span={6} foot={charts.g6_sensibilite_prix.interpretation}>
          <SensitivityCurve chart={charts.g6_sensibilite_prix} />
        </ChartCard>

        {/* G7 — Sensibilité retard */}
        <ChartCard title="Sensibilité : retard travaux → rendement" span={6} foot={charts.g7_sensibilite_retard.interpretation}>
          <SensitivityCurve chart={charts.g7_sensibilite_retard} />
        </ChartCard>

        {/* G9 — Radar de risque */}
        <ChartCard title="Exposition au risque (/5)" span={6} foot={charts.g9_risque.interpretation}>
          <RiskRadar chart={charts.g9_risque} />
        </ChartCard>

        {/* G11 — Marge marchand */}
        <ChartCard title="Marge marchand" span={6} foot={charts.g11_marge_marchand.interpretation}>
          <BarList
            items={[
              { label: "Coût total", value: eur(charts.g11_marge_marchand.cout_total_eur), percent: 100 },
              {
                label: "Prix de revente central",
                value: eur(charts.g11_marge_marchand.prix_revente_eur),
                percent: Math.min(100, (charts.g11_marge_marchand.prix_revente_eur / charts.g11_marge_marchand.cout_total_eur) * 100),
              },
            ]}
            emptyLabel="—"
          />
          <p className="inv-chart-foot">
            Marge : {eur(charts.g11_marge_marchand.marge_eur)} ({pct(charts.g11_marge_marchand.marge_pct)}) ·
            seuil de fragilité {pct(charts.g11_marge_marchand.seuil_fragilite_pct)}.
          </p>
        </ChartCard>

        {/* G4 — Gantt */}
        <ChartCard title="Calendrier opérationnel" span={8} foot={charts.g4_gantt.interpretation}>
          <div className="inv-gantt">
            {charts.g4_gantt.jalons.map((j) => {
              const left = (j.debut_mois / charts.g4_gantt.duree_totale_mois) * 100;
              const width = (j.duree_mois / charts.g4_gantt.duree_totale_mois) * 100;
              return (
                <div className="inv-gantt-row" key={j.key}>
                  <span className="inv-gantt-lab">{j.label}</span>
                  <div className="inv-gantt-track">
                    <span className="inv-gantt-bar" style={{ left: `${left}%`, width: `${Math.max(2, width)}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="inv-gantt-axis">
              <span />
              <div className="inv-gantt-axis-inner">
                <span>M0</span>
                <span>M{Math.round(charts.g4_gantt.duree_totale_mois / 2)}</span>
                <span>M{charts.g4_gantt.duree_totale_mois}</span>
              </div>
            </div>
          </div>
        </ChartCard>

        {/* G8 — Cashflow (J-curve) → réutilise BarList signée comme repère simple */}
        <ChartCard title="Cashflow prévisionnel (J-curve)" span={4} foot={charts.g8_cashflow.interpretation}>
          <SensitivityCurve
            chart={{
              type: "line",
              titre: charts.g8_cashflow.titre,
              x_label: "Mois",
              points: charts.g8_cashflow.points.map((p) => ({ x: p.mois, irr: p.cumul_eur, rendement_total_pct: 0 })),
              interpretation: charts.g8_cashflow.interpretation,
            }}
          />
        </ChartCard>
      </div>

      {/* Sûretés + Token */}
      <div className="inv-grid-2" style={{ marginTop: "var(--ct-space-lg)" }}>
        <div className="inv-chart-card">
          <div className="inv-chart-head">
            <span className="inv-chart-title">Sûretés & sécurités</span>
          </div>
          <ul className="inv-doc-list">
            {suretes.map((s) => (
              <li className="inv-doc-row" key={s}>
                <span className="inv-doc-name">{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="inv-chart-card">
          <div className="inv-chart-head">
            <span className="inv-chart-title">Token & structure</span>
          </div>
          <dl className="inv-dl">
            <dt>Nature</dt>
            <dd>Titre de créance tokenisé (obligation)</dd>
            <dt>Standard</dt>
            <dd>ERC-3643 · miroir du registre légal DEEP</dd>
            <dt>Émission</dt>
            <dd>Au closing (pas avant)</dd>
            <dt>Règlement</dt>
            <dd>EUR par défaut · EURC/EURe via CASP régulé</dd>
            <dt>Cadre</dt>
            <dd>Security token · hors MiCA pour le token</dd>
          </dl>
        </div>
      </div>

      {/* Closing timeline */}
      <div className="inv-chart-card" style={{ marginTop: "var(--ct-space-lg)" }}>
        <div className="inv-chart-head">
          <span className="inv-chart-title">Closing — séquence</span>
        </div>
        <Timeline items={closing} />
      </div>

      <p className="inv-fineprint" style={{ marginTop: "var(--ct-space-lg)" }}>
        Risques (non exhaustif) : perte en capital · illiquidité (lock-up) · retard/dépassement des
        travaux · baisse du marché · défaut de l’opérateur · risque de taux · risque réglementaire. Le
        coupon central retenu est de {pct(deal.input.funding.taux_coupon_obligataire_annuel)} (cible,
        non garanti). Vous êtes créancier obligataire de la SAS, pas propriétaire du bien.
      </p>
    </div>
  );
}
