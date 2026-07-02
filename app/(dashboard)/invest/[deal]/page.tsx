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
import { SubscribePanel } from "./_components/SubscribePanel";
import { PageStack, KpiGrid, KpiCard } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";

const di = UI.invest.dealDetail;

export const dynamic = "force-dynamic";

/** Carte de chart (wrapper local, utilities Tailwind — grille 12 colonnes). */
const CHART_SPAN: Record<12 | 8 | 6 | 4 | 3, string> = {
  12: "md:col-span-12",
  8: "md:col-span-8",
  6: "md:col-span-6",
  4: "md:col-span-4",
  3: "md:col-span-3",
};

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
    <div
      className={`col-span-12 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm ${CHART_SPAN[span]}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{title}</span>
      </div>
      {children}
      {foot ? <p className="text-xs text-slate-500">{foot}</p> : null}
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
  /** Id DB du deal (null pour les fiches de démonstration → souscription non branchée). */
  dealId: string | null;
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
      dealId: dbDetail.deal.id,
      slug: dbDetail.deal.slug,
      nom: dbDetail.deal.name,
      localisation:
        [dbDetail.deal.city, dbDetail.deal.country].filter(Boolean).join(", ") ||
        "Localisation au closing/NDA",
      sasName: dbDetail.spv?.legalName ?? dbDetail.deal.name,
      badges: dealBadges({
        typeLabel: di.typeLabels[dbDetail.deal.dealType] ?? dbDetail.deal.dealType,
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
      dealId: null, // fiche de démonstration : souscription non branchée (aucune donnée réelle).
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

  const kycCta = (
    <Link
      href="/invest/onboarding"
      className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
    >
      {di.kycCta}
    </Link>
  );

  return (
    <PageStack>
      <Link href="/invest" className="text-sm text-slate-400 hover:text-slate-200">
        {di.backLink}
      </Link>

      {/* HERO + bloc souscription */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex items-end rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-white/[0.03] to-white/[0.03] p-6 min-h-56">
          <div className="flex flex-col gap-3">
            <div className="text-sm text-slate-400">{view.localisation}</div>
            <h1 className="text-3xl font-bold tracking-tight text-white">{view.nom}</h1>
            <ProductBadges badges={view.badges} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-2xl font-bold text-white">{eur(view.collecteEur)}</span>
              <span className="text-sm text-slate-400">
                / {eur(view.objectifEur)} {di.goalSuffix}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={taux}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={di.raiseProgressAria}
            >
              <div
                className="h-full rounded-full bg-indigo-400"
                style={{ width: `${Math.min(100, taux)}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-slate-100">{pct(sheet.rendement_cible_irr)}</span>
                <span className="text-xs text-slate-500">{di.stats.triTarget}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-slate-100">{pct(metrics.ltv)}</span>
                <span className="text-xs text-slate-500">{di.stats.ltv}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-slate-100">{sheet.input.schedule.duree_mois} m</span>
                <span className="text-xs text-slate-500">{di.stats.duration}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-slate-100">{eur(view.ticketMinEur)}</span>
                <span className="text-xs text-slate-500">{di.stats.ticketMin}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-slate-100">{eur(view.ticketMaxEur)}</span>
                <span className="text-xs text-slate-500">{di.stats.ticketMax}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-slate-100">{taux}%</span>
                <span className="text-xs text-slate-500">{di.stats.raised}</span>
              </div>
            </div>
            {view.dealId ? null : (
              <>
                <button
                  className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white opacity-50"
                  type="button"
                  disabled
                >
                  {di.demoReserveBtn}
                </button>
                <p className="text-xs text-slate-500">{di.demoReserveNote}</p>
              </>
            )}
          </div>
          <StatusPill tone={view.statusTone}>{view.statusLabel}</StatusPill>
        </div>
      </div>

      {/* BLOC SOUSCRIPTION (Epic 1.3) — soft-commit → signature eIDAS → séquestre tiers.
          Rendu uniquement pour un deal réel (DB) ; la démo affiche le bouton désactivé ci-dessus. */}
      {view.dealId ? (
        <SubscribePanel
          dealId={view.dealId}
          dealName={view.nom}
          dealOpen={view.statusTone === "open"}
          ticketMinEur={view.ticketMinEur}
          ticketMaxEur={view.ticketMaxEur}
          settlementCurrency="EUR"
          sequestreLabel={view.sequestre}
          kycApproved={!view.kycGated}
          spvLabel={view.sasName}
        />
      ) : null}

      {/* L4 — nature juridique permanente */}
      <LegalNatureBadge sasName={view.sasName} />

      {/* GATE KYC — bandeau d'invitation tant que les chiffres détaillés sont masqués */}
      {kycGated ? (
        <Banner tone="warn">
          {di.kycBanner}{" "}
          <Link href="/invest/onboarding" className="underline hover:text-slate-100">
            {di.kycCta}
          </Link>
          .
        </Banner>
      ) : null}

      {/* Funnel de souscription (aperçu des 4 étapes) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {di.subscriptionFunnelTitle}
          </span>
        </div>
        <Stepper current={0} steps={[...di.stepperSteps]} />
        <p className="text-xs text-slate-500">{di.subscriptionFunnelFoot(view.sequestre)}</p>
      </div>

      {/* Warnings du moteur (cohérence — affichés honnêtement, non gatés) */}
      {!kycGated && sheet.warnings.length > 0 ? (
        <Banner tone="warn">
          <b>{di.warningsTitle}</b>
          <ul className="ml-4 list-disc">
            {sheet.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Banner>
      ) : null}

      {/* KPI économie de l'opération (structure — toujours visible) */}
      <KpiGrid>
        <KpiCard label={di.kpis.totalCost} value={eur(metrics.cout_total_eur)} />
        <KpiCard label={di.kpis.seniorDebt} value={eur(sheet.input.funding.dette_senior_eur)} />
        <KpiCard label={di.kpis.bonds} value={eur(sheet.input.funding.obligations_cible_eur)} accent />
        <KpiCard label={di.kpis.sponsorEquity} value={eur(sheet.input.funding.equity_sponsor_eur)} />
      </KpiGrid>

      {/* Les 11 graphiques (P8). Structure publique non gatée ; détails sous <Gate>. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {/* G1 — Répartition dette/equity (structure — non gatée) */}
        <ChartCard title={di.charts.debtEquity} span={4} foot={charts.g1_dette_equity.interpretation}>
          <div className="flex justify-center py-2">
            <Donut
              value={(sheet.input.funding.obligations_cible_eur / charts.g1_dette_equity.total_eur) * 100}
              centerLabel={pct(sheet.input.funding.obligations_cible_eur / charts.g1_dette_equity.total_eur)}
              sublabel={di.obligationsDonut}
              accent
            />
          </div>
          <div className="flex flex-col gap-1.5">
            {charts.g1_dette_equity.segments.map((s) => (
              <div className="flex items-center justify-between text-sm" key={s.key}>
                <span className="text-slate-400">{s.label}</span>
                <span className="font-semibold text-slate-100">{pct(s.part)}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* G2 — Use of funds (structure — non gatée) */}
        <ChartCard title={di.charts.useOfFunds} span={8} foot={charts.g2_use_of_funds.interpretation}>
          <BarList items={useOfFunds} emptyLabel={di.useOfFundsEmpty} />
        </ChartCard>

        {/* G3 — Waterfall (DÉTAIL — gaté KYC) */}
        <ChartCard title={di.charts.waterfall} span={12} foot={kycGated ? undefined : charts.g3_waterfall.interpretation}>
          <Gate locked={kycGated} message={di.gate.waterfall} cta={kycCta}>
            <Waterfall chart={charts.g3_waterfall} />
          </Gate>
        </ChartCard>

        {/* G5 — Scénarios (DÉTAIL — gaté KYC) */}
        <ChartCard title={di.charts.scenarios} span={6} foot={kycGated ? undefined : charts.g5_scenarios.interpretation}>
          <Gate locked={kycGated} message={di.gate.scenarios} cta={kycCta}>
            <ScenarioBars chart={charts.g5_scenarios} />
          </Gate>
        </ChartCard>

        {/* G10 — LTV gauge (structure — non gatée) */}
        <ChartCard title={di.charts.ltv} span={6} foot={charts.g10_ltv.interpretation}>
          <Gauge chart={charts.g10_ltv} />
        </ChartCard>

        {/* G6 — Sensibilité prix (DÉTAIL — gaté KYC) */}
        <ChartCard title={di.charts.sensPrice} span={6} foot={kycGated ? undefined : charts.g6_sensibilite_prix.interpretation}>
          <Gate locked={kycGated} message={di.gate.sensPrice} cta={kycCta}>
            <SensitivityCurve chart={charts.g6_sensibilite_prix} />
          </Gate>
        </ChartCard>

        {/* G7 — Sensibilité retard (DÉTAIL — gaté KYC) */}
        <ChartCard title={di.charts.sensDelay} span={6} foot={kycGated ? undefined : charts.g7_sensibilite_retard.interpretation}>
          <Gate locked={kycGated} message={di.gate.sensDelay} cta={kycCta}>
            <SensitivityCurve chart={charts.g7_sensibilite_retard} />
          </Gate>
        </ChartCard>

        {/* G9 — Radar de risque (structure — non gatée) */}
        <ChartCard title={di.charts.risk} span={6} foot={charts.g9_risque.interpretation}>
          <RiskRadar chart={charts.g9_risque} />
        </ChartCard>

        {/* G11 — Marge marchand (structure — non gatée) */}
        <ChartCard title={di.charts.margin} span={6} foot={undefined}>
          <BarList
            items={[
              { label: di.marginLabels.costTotal, value: eur(charts.g11_marge_marchand.cout_total_eur), percent: 100 },
              {
                label: di.marginLabels.resalePrice,
                value: eur(charts.g11_marge_marchand.prix_revente_eur),
                percent: Math.min(100, (charts.g11_marge_marchand.prix_revente_eur / charts.g11_marge_marchand.cout_total_eur) * 100),
              },
            ]}
            emptyLabel="—"
          />
          <p className="text-xs text-slate-500">
            {di.marginFoot(
              eur(charts.g11_marge_marchand.marge_eur),
              pct(charts.g11_marge_marchand.marge_pct),
              pct(charts.g11_marge_marchand.seuil_fragilite_pct),
            )}
          </p>
        </ChartCard>

        {/* G4 — Gantt (calendrier — non gaté) */}
        <ChartCard title={di.charts.gantt} span={8} foot={charts.g4_gantt.interpretation}>
          <div className="flex flex-col gap-2">
            {charts.g4_gantt.jalons.map((j) => {
              const left = (j.debut_mois / charts.g4_gantt.duree_totale_mois) * 100;
              const width = (j.duree_mois / charts.g4_gantt.duree_totale_mois) * 100;
              return (
                <div className="grid grid-cols-[120px_1fr] items-center gap-2" key={j.key}>
                  <span className="truncate text-xs text-slate-400">{j.label}</span>
                  <div className="relative h-2 rounded-full bg-white/10">
                    <span
                      className="absolute inset-y-0 rounded-full bg-indigo-400"
                      style={{ left: `${left}%`, width: `${Math.max(2, width)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-[120px_1fr] items-center gap-2">
              <span />
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>M0</span>
                <span>M{Math.round(charts.g4_gantt.duree_totale_mois / 2)}</span>
                <span>M{charts.g4_gantt.duree_totale_mois}</span>
              </div>
            </div>
          </div>
        </ChartCard>

        {/* G8 — Cashflow (J-curve) (DÉTAIL — gaté KYC) */}
        <ChartCard title={di.charts.cashflow} span={4} foot={kycGated ? undefined : charts.g8_cashflow.interpretation}>
          <Gate locked={kycGated} message={di.gate.cashflow} cta={kycCta}>
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              {di.securitiesTitle}
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-white/5">
            {di.suretes.map((s) => (
              <li className="flex items-center justify-between py-2 text-sm" key={s}>
                <span className="text-slate-200">{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              {di.tokenTitle}
            </span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-slate-500">{di.tokenDl.nature}</dt>
            <dd className="text-slate-200">{di.tokenDl.natureVal}</dd>
            <dt className="text-slate-500">{di.tokenDl.standard}</dt>
            <dd className="text-slate-200">{di.tokenDl.standardVal}</dd>
            <dt className="text-slate-500">{di.tokenDl.emission}</dt>
            <dd className="text-slate-200">{di.tokenDl.emissionVal}</dd>
            <dt className="text-slate-500">{di.tokenDl.settlement}</dt>
            <dd className="text-slate-200">{di.tokenDl.settlementVal}</dd>
            <dt className="text-slate-500">{di.tokenDl.framework}</dt>
            <dd className="text-slate-200">{di.tokenDl.frameworkVal}</dd>
          </dl>
        </div>
      </div>

      {/* Data room (inv_documents publics du deal) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {di.dataRoomTitle}
          </span>
        </div>
        {view.documents.length > 0 ? (
          <ul className="flex flex-col divide-y divide-white/5">
            {view.documents.map((d) => (
              <li className="flex items-center justify-between py-2 text-sm" key={d.id}>
                <span className="text-slate-200">{d.title}</span>
                <span className="text-slate-500">{d.docType}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">{di.dataRoomEmpty}</p>
        )}
      </div>

      {/* Closing timeline */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {di.closingTitle}
          </span>
        </div>
        <Timeline items={[...di.closing]} />
      </div>

      <p className="text-xs text-slate-500">{di.fineprint(pct(view.couponCentral))}</p>
    </PageStack>
  );
}
