/**
 * FICHE DEAL — l'écran central (étude P7 + 11 graphiques P8). RSC.
 *
 * Données : `fetchDealBySlug()` lit le deal en DB (service lib/invest/deal) +
 * applique la GATE KYC (chiffres détaillés masqués si viewer non KYC-approuvé).
 * Si le slug n'existe pas en DB → FALLBACK sur la démo (`getDemoDeal`). Si rien
 * ne correspond → 404.
 *
 * Anti-FIA matérialisé :
 *   - L4 : <LegalNatureBadge> permanent (créancier ≠ propriétaire).
 *   - L5 : scénarios + "cible · non garanti".
 *   - L3 : bloc de souscription = "Réserver ma place" (non engageant, sans versement).
 *   - L6 : séquestre tiers nommé.
 *   - GATE KYC : <Gate> sur les charts détaillés (waterfall/scénarios/sensibilités/
 *     cashflow) tant que le viewer n'est pas KYC, CTA vers /invest/onboarding.
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
  Gate,
  dealBadges,
  type ProductBadge,
  type StatusTone,
  eur,
  pct,
} from "@/components/invest";
import type { DealSheet } from "@/lib/invest/finance";
import { getDemoDeal, DEMO_DEALS } from "../_data/demo";
import { fetchDealBySlug } from "../_data/server";

export const dynamic = "force-dynamic";

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

/** Document de data room (commun DB / démo). */
interface DocRow {
  id: string;
  title: string;
  docType: string;
}

/** View-model unifié de la fiche (DB ou démo). */
interface FicheView {
  slug: string;
  nom: string;
  localisation: string;
  sasName: string;
  badges: ProductBadge[];
  statusTone: StatusTone;
  statusLabel: string;
  sheet: DealSheet;
  kycGated: boolean;
  collecteEur: number;
  objectifEur: number;
  ticketMinEur: number;
  ticketMaxEur: number;
  sequestre: string;
  documents: DocRow[];
  couponCentral: number;
}

const TYPE_LABEL: Record<string, string> = {
  marchand_de_biens: "Marchand de biens",
  promotion: "Promotion",
  locatif: "Locatif",
  value_add: "Value-add",
  mixte: "Mixte",
};

// Pré-génère les routes de démo (SSG fallback) ; les deals DB sont dynamiques.
export function generateStaticParams() {
  return DEMO_DEALS.map((d) => ({ deal: d.slug }));
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ deal: string }>;
}) {
  const { deal: slug } = await params;

  // 1. Tente la DB (avec gate KYC). 2. Fallback démo. 3. 404.
  const dbDetail = await fetchDealBySlug(slug);
  const demo = getDemoDeal(slug);

  let view: FicheView;
  if (dbDetail) {
    const ltvElevee = dbDetail.sheet.metrics.ltv > 0.7;
    view = {
      slug: dbDetail.deal.slug,
      nom: dbDetail.deal.name,
      localisation:
        [dbDetail.deal.city, dbDetail.deal.country].filter(Boolean).join(", ") ||
        "Localisation au closing/NDA",
      sasName: dbDetail.spv?.legalName ?? dbDetail.deal.name,
      badges: dealBadges({
        typeLabel: TYPE_LABEL[dbDetail.deal.dealType] ?? dbDetail.deal.dealType,
        rangLabel: dbDetail.tranche?.seniority === "mezzanine" ? "Mezzanine" : "Senior secured",
        risqueEleve: ltvElevee,
      }),
      statusTone: "open",
      statusLabel: "Ouvert",
      sheet: dbDetail.sheet,
      kycGated: dbDetail.kycGated,
      collecteEur: dbDetail.deal.raisedEur,
      objectifEur: dbDetail.deal.targetRaiseEur,
      ticketMinEur: dbDetail.deal.minTicketEur,
      ticketMaxEur: dbDetail.deal.maxTicketEur ?? dbDetail.deal.minTicketEur * 100,
      sequestre: "Séquestre tiers (notaire ou EMI régulée)",
      documents: dbDetail.documents.map((d) => ({ id: d.id, title: d.title, docType: d.docType })),
      couponCentral: dbDetail.tranche?.couponRatePct != null ? dbDetail.tranche.couponRatePct / 100 : 0,
    };
  } else if (demo) {
    view = {
      slug: demo.slug,
      nom: demo.input.nom,
      localisation: demo.input.localisation,
      sasName: demo.sasName,
      badges: demo.badges,
      statusTone: demo.statusTone,
      statusLabel: demo.statusLabel,
      sheet: demo.sheet,
      kycGated: false, // la démo n'est pas gatée (aucune donnée réelle).
      collecteEur: demo.collecteEur,
      objectifEur: demo.objectifEur,
      ticketMinEur: demo.input.ticket_min_eur ?? 1000,
      ticketMaxEur: demo.input.ticket_max_eur ?? 100000,
      sequestre: demo.sequestre,
      documents: [],
      couponCentral: demo.input.funding.taux_coupon_obligataire_annuel,
    };
  } else {
    notFound();
  }

  const { sheet, kycGated } = view;
  const { charts, metrics } = sheet;
  const taux = view.objectifEur > 0 ? Math.round((view.collecteEur / view.objectifEur) * 100) : 0;

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

  // Closing (timeline — séquence séquestre → DEEP → mint → lock-up).
  const closing = [
    { title: "Déblocage du séquestre vers la SAS", sub: "À l'atteinte de l'objectif + prêt accordé", state: "todo" as const },
    { title: "Inscription au registre légal (DEEP)", sub: "Source de vérité légale", state: "todo" as const },
    { title: "Mint du token ERC-3643 sur votre coffre", sub: "Miroir on-chain, après le DEEP", state: "todo" as const },
    { title: "Lock-up activé jusqu'à l'exit", sub: "Titres illiquides pendant l'opération", state: "todo" as const },
  ];

  // CTA de déblocage KYC (vers l'onboarding investisseur).
  const kycCta = (
    <Link href="/invest/onboarding" className="inv-btn-reserve" style={{ display: "inline-block", textDecoration: "none" }}>
      Vérifier mon identité (KYC)
    </Link>
  );

  return (
    <div className="ct-page-area">
      <Link href="/invest" className="inv-deal-loc" style={{ marginBottom: "var(--ct-space-md)" }}>
        ‹ Opportunités
      </Link>

      {/* HERO + bloc souscription */}
      <div className="inv-detail-head">
        <div className="inv-detail-hero">
          <div className="inv-detail-hero-inner">
            <div className="inv-detail-loc">{view.localisation}</div>
            <h1 className="inv-detail-name">{view.nom}</h1>
            <ProductBadges badges={view.badges} />
          </div>
        </div>

        <div className="inv-detail-side">
          <div className="inv-raise-box">
            <div className="inv-raise-amt">
              <span className="inv-big">{eur(view.collecteEur)}</span>
              <span className="inv-goal">/ {eur(view.objectifEur)} objectif</span>
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
                <span className="inv-v">{sheet.input.schedule.duree_mois} m</span>
                <span className="inv-l">Durée</span>
              </div>
            </div>
            <div className="inv-raise-stats">
              <div className="inv-raise-stat">
                <span className="inv-v">{eur(view.ticketMinEur)}</span>
                <span className="inv-l">Ticket min</span>
              </div>
              <div className="inv-raise-stat">
                <span className="inv-v">{eur(view.ticketMaxEur)}</span>
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
          <StatusPill tone={view.statusTone}>{view.statusLabel}</StatusPill>
        </div>
      </div>

      {/* L4 — nature juridique permanente */}
      <div style={{ marginBottom: "var(--ct-space-lg)" }}>
        <LegalNatureBadge sasName={view.sasName} />
      </div>

      {/* GATE KYC — bandeau d'invitation tant que les chiffres détaillés sont masqués */}
      {kycGated ? (
        <div style={{ marginBottom: "var(--ct-space-lg)" }}>
          <Banner tone="warn">
            Les chiffres financiers détaillés (waterfall, scénarios, sensibilités, cashflow) sont
            masqués tant que votre identité n’est pas vérifiée. La structure reste visible. Investir
            comporte un risque de perte en capital ; tout rendement est une cible non garantie.{" "}
            <Link href="/invest/onboarding">Vérifier mon identité (KYC)</Link>.
          </Banner>
        </div>
      ) : null}

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
          tiers : {view.sequestre}. La plateforme ne détient jamais vos fonds ; remboursement intégral
          si le deal n’aboutit pas.
        </p>
      </div>

      {/* Warnings du moteur (cohérence — affichés honnêtement, non gatés) */}
      {!kycGated && sheet.warnings.length > 0 ? (
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

      {/* KPI économie de l'opération (structure — toujours visible) */}
      <div className="ct-kpi-grid cols-4">
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">Coût total projet</div>
          <div className="ct-kpi-value">{eur(metrics.cout_total_eur)}</div>
        </div>
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">Dette senior</div>
          <div className="ct-kpi-value">{eur(sheet.input.funding.dette_senior_eur)}</div>
        </div>
        <div className="ct-kpi-card accent">
          <div className="ct-kpi-label">Obligations (vous)</div>
          <div className="ct-kpi-value">{eur(sheet.input.funding.obligations_cible_eur)}</div>
        </div>
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">Equity sponsor</div>
          <div className="ct-kpi-value">{eur(sheet.input.funding.equity_sponsor_eur)}</div>
        </div>
      </div>

      {/* Les 11 graphiques (P8). Structure publique non gatée ; détails sous <Gate>. */}
      <div className="inv-chart-grid">
        {/* G1 — Répartition dette/equity (structure — non gatée) */}
        <ChartCard title="Répartition dette / equity" span={4} foot={charts.g1_dette_equity.interpretation}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--ct-space-md)" }}>
            <Donut value={sheet.input.funding.obligations_cible_eur / charts.g1_dette_equity.total_eur * 100} centerLabel={pct(sheet.input.funding.obligations_cible_eur / charts.g1_dette_equity.total_eur)} sublabel="Obligations" accent />
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

        {/* G2 — Use of funds (structure — non gatée) */}
        <ChartCard title="Use of funds" span={8} foot={charts.g2_use_of_funds.interpretation}>
          <BarList items={useOfFunds} emptyLabel="Aucun poste." />
        </ChartCard>

        {/* G3 — Waterfall (DÉTAIL — gaté KYC) */}
        <ChartCard title="Waterfall de distribution (scénario central)" span={12} foot={kycGated ? undefined : charts.g3_waterfall.interpretation}>
          <Gate locked={kycGated} message="Détail du waterfall après vérification d'identité (KYC)." cta={kycCta}>
            <Waterfall chart={charts.g3_waterfall} />
          </Gate>
        </ChartCard>

        {/* G5 — Scénarios (DÉTAIL — gaté KYC) */}
        <ChartCard title="Scénarios (TRI cible · non garanti)" span={6} foot={kycGated ? undefined : charts.g5_scenarios.interpretation}>
          <Gate locked={kycGated} message="Scénarios pessimiste/optimiste après vérification d'identité (KYC)." cta={kycCta}>
            <ScenarioBars chart={charts.g5_scenarios} />
          </Gate>
        </ChartCard>

        {/* G10 — LTV gauge (structure — non gatée) */}
        <ChartCard title="LTV (dette / valeur)" span={6} foot={charts.g10_ltv.interpretation}>
          <Gauge chart={charts.g10_ltv} />
        </ChartCard>

        {/* G6 — Sensibilité prix (DÉTAIL — gaté KYC) */}
        <ChartCard title="Sensibilité : prix de revente → rendement" span={6} foot={kycGated ? undefined : charts.g6_sensibilite_prix.interpretation}>
          <Gate locked={kycGated} message="Sensibilité détaillée après vérification d'identité (KYC)." cta={kycCta}>
            <SensitivityCurve chart={charts.g6_sensibilite_prix} />
          </Gate>
        </ChartCard>

        {/* G7 — Sensibilité retard (DÉTAIL — gaté KYC) */}
        <ChartCard title="Sensibilité : retard travaux → rendement" span={6} foot={kycGated ? undefined : charts.g7_sensibilite_retard.interpretation}>
          <Gate locked={kycGated} message="Sensibilité détaillée après vérification d'identité (KYC)." cta={kycCta}>
            <SensitivityCurve chart={charts.g7_sensibilite_retard} />
          </Gate>
        </ChartCard>

        {/* G9 — Radar de risque (structure — non gatée) */}
        <ChartCard title="Exposition au risque (/5)" span={6} foot={charts.g9_risque.interpretation}>
          <RiskRadar chart={charts.g9_risque} />
        </ChartCard>

        {/* G11 — Marge marchand (structure — non gatée) */}
        <ChartCard title="Marge marchand" span={6} foot={undefined}>
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

        {/* G4 — Gantt (calendrier — non gaté) */}
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

        {/* G8 — Cashflow (J-curve) (DÉTAIL — gaté KYC) */}
        <ChartCard title="Cashflow prévisionnel (J-curve)" span={4} foot={kycGated ? undefined : charts.g8_cashflow.interpretation}>
          <Gate locked={kycGated} message="Cashflow détaillé après vérification d'identité (KYC)." cta={kycCta}>
            <SensitivityCurve
              chart={{
                type: "line",
                titre: charts.g8_cashflow.titre,
                x_label: "Mois",
                points: charts.g8_cashflow.points.map((p) => ({ x: p.mois, irr: p.cumul_eur, rendement_total_pct: 0 })),
                interpretation: charts.g8_cashflow.interpretation,
              }}
            />
          </Gate>
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

      {/* Data room (inv_documents publics du deal) */}
      <div className="inv-chart-card" style={{ marginTop: "var(--ct-space-lg)" }}>
        <div className="inv-chart-head">
          <span className="inv-chart-title">Data room — documents</span>
        </div>
        {view.documents.length > 0 ? (
          <ul className="inv-doc-list">
            {view.documents.map((d) => (
              <li className="inv-doc-row" key={d.id}>
                <span className="inv-doc-name">{d.title}</span>
                <span className="inv-doc-meta">{d.docType}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="inv-chart-foot">
            Aucun document publié pour le moment. Les pièces (contrat d’émission, expertise,
            intercreditor, K-bis) seront mises à disposition au fil de l’instruction.
          </p>
        )}
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
        coupon central retenu est de {pct(view.couponCentral)} (cible, non garanti). Vous êtes
        créancier obligataire de la SAS, pas propriétaire du bien.
      </p>
    </div>
  );
}
