/**
 * BACK-OFFICE OPÉRATEUR — écran de CLOSING d'un deal (saga DvP). RSC.
 *
 * Affiche : les conditions suspensives + leur état, la garde 4-eyes, le bouton
 * « Lancer le closing » (désactivé tant que la garde n'est pas réunie), l'état de
 * la dernière réconciliation DEEP↔chaîne, et le registre DEEP (holdings) en lecture.
 *
 * Rappel juridique affiché : le registre DEEP est la SOURCE DE VÉRITÉ ; le token
 * ERC-3643 n'en est que le miroir. L'investisseur est CRÉANCIER (obligataire), pas
 * détenteur d'un droit réel sur l'immeuble. Les fonds transitent par un SÉQUESTRE
 * tiers et ne sont libérés qu'au closing ; tout rendement reste non garanti et
 * comporte un risque de perte en capital.
 *
 * Réservé aux opérateurs/admin/compliance (garde serveur via `fetchClosingState`).
 */

import Link from "next/link";
import { PageStack, PageHeader, KpiGrid, KpiCard, Sub } from "@/components/cockpit/primitives";
import { Banner, StatusPill, type StatusTone } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { fetchClosingState } from "../../../_data/server";
import { ClosingLauncher } from "./ClosingLauncher";

export const dynamic = "force-dynamic";

/** Mappe le résultat de réconciliation → ton de pastille. */
function reconTone(result: string, paused: boolean): StatusTone {
  if (paused || result === "chain_exceeds_deep") return "late";
  if (result === "in_sync") return "open";
  if (result === "mint_missing") return "soon";
  return "neutral";
}

export default async function ClosingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await fetchClosingState(id);

  if (!state.configured) {
    return (
      <PageStack>
        <PageHeader kicker={UI.invest.operator.closing.kicker} title={UI.invest.operator.closing.title} />
        <Banner tone="warn">{UI.invest.operator.closing.dbUnavailable}</Banner>
      </PageStack>
    );
  }
  if (!state.authorized) {
    return (
      <PageStack>
        <PageHeader kicker={UI.invest.operator.closing.kicker} title={UI.invest.operator.closing.title} />
        <Banner tone="warn">{UI.invest.operator.closing.unauthorized}</Banner>
      </PageStack>
    );
  }
  if (!state.found) {
    return (
      <PageStack>
        <PageHeader kicker={UI.invest.operator.closing.kicker} title={UI.invest.operator.closing.title} />
        <Banner tone="warn">{UI.invest.operator.closing.notFound}</Banner>
        <p className="inv-chart-foot">
          <Link href="/invest/operateur">{UI.invest.operator.closing.backToOperations}</Link>
        </p>
      </PageStack>
    );
  }

  const ready = state.conditionsSnapshot.allMet && state.fourEyesApproved;
  const totalUnits = state.holdings.reduce((s, h) => s + h.units, 0);

  return (
    <PageStack>
      <PageHeader
        kicker={UI.invest.operator.closing.kickerDvp}
        title={state.dealName}
        meta={<Sub>{UI.invest.operator.closing.headerSub}</Sub>}
      />

      <div className="inv-mk-toolbar inv-toolbar-between">
        <span>
          {UI.invest.operator.closing.dealStatusPrefix}
          <StatusPill tone="neutral">{state.dealStatus}</StatusPill>
        </span>
        <Link href={`/invest/${state.dealSlug}`} className="inv-doc-name">
          {UI.invest.operator.closing.viewPublicSheet}
        </Link>
      </div>

      {/* ── Bandeau source de vérité ───────────────────────────────────────── */}
      <Banner tone="info">{UI.invest.operator.closing.sourceOfTruthBanner}</Banner>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <KpiGrid className="cols-4 inv-kpi-my">
        <KpiCard
          label={UI.invest.operator.closing.kpiConditions}
          value={`${state.conditionsSnapshot.total - state.conditionsSnapshot.unmet.length}/${state.conditionsSnapshot.total}`}
        />
        <KpiCard
          label={UI.invest.operator.closing.kpiFourEyes}
          value={state.fourEyesApproved ? UI.invest.operator.closing.kpiFourEyesOk : UI.invest.operator.closing.kpiFourEyesRequired}
          accent={state.fourEyesApproved}
        />
        <KpiCard
          label={UI.invest.operator.closing.kpiFundedSubscriptions}
          value={String(state.fundedCount)}
        />
        <KpiCard
          label={UI.invest.operator.closing.kpiDeepUnits}
          value={String(totalUnits)}
        />
      </KpiGrid>

      {/* ── Conditions suspensives ─────────────────────────────────────────── */}
      <div className="inv-chart-card inv-chart-mb">
        <h3 className="inv-chart-title">{UI.invest.operator.closing.conditionsTitle}</h3>
        {state.conditions.length === 0 ? (
          <p className="inv-chart-foot">{UI.invest.operator.closing.conditionsEmpty}</p>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                <th>{UI.invest.operator.closing.conditionsColCode}</th>
                <th>{UI.invest.operator.closing.conditionsColLabel}</th>
                <th className="r">{UI.invest.operator.closing.conditionsColState}</th>
              </tr>
            </thead>
            <tbody>
              {state.conditions.map((c) => (
                <tr key={c.code}>
                  <td>{c.code}</td>
                  <td>{c.label}</td>
                  <td className="r">
                    <StatusPill tone={c.isMet ? "open" : "soon"}>{c.isMet ? UI.invest.operator.closing.conditionMet : UI.invest.operator.closing.conditionPending}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Lancement de la saga ───────────────────────────────────────────── */}
      <div className="inv-chart-card inv-chart-mb">
        <h3 className="inv-chart-title">{UI.invest.operator.closing.launchTitle}</h3>
        <p className="inv-chart-foot inv-chart-intro">{UI.invest.operator.closing.launchIntro}</p>
        <ClosingLauncher dealId={state.dealId} ready={ready} />
      </div>

      {/* ── Réconciliation DEEP↔chaîne ─────────────────────────────────────── */}
      <div className="inv-chart-card inv-chart-mb">
        <h3 className="inv-chart-title">{UI.invest.operator.closing.reconTitle}</h3>
        {state.lastReconciliation ? (
          <p className="inv-chart-foot">
            {UI.invest.operator.closing.reconLastPass}
            <StatusPill
              tone={reconTone(state.lastReconciliation.result, state.lastReconciliation.triggeredPause)}
            >
              {state.lastReconciliation.triggeredPause ? UI.invest.operator.closing.reconPaused : state.lastReconciliation.result}
            </StatusPill>{" "}
            {state.lastReconciliation.finishedAt
              ? `· ${new Date(state.lastReconciliation.finishedAt).toLocaleString("fr-FR")}`
              : ""}
          </p>
        ) : (
          <p className="inv-chart-foot">{UI.invest.operator.closing.reconEmpty}</p>
        )}
      </div>

      {/* ── Registre DEEP (holdings) ───────────────────────────────────────── */}
      <div className="inv-chart-card">
        <h3 className="inv-chart-title">{UI.invest.operator.closing.deepTitle}</h3>
        {state.holdings.length === 0 ? (
          <p className="inv-chart-foot">{UI.invest.operator.closing.deepEmpty}</p>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                <th>{UI.invest.operator.closing.deepColHolder}</th>
                <th className="r">{UI.invest.operator.closing.deepColUnits}</th>
              </tr>
            </thead>
            <tbody>
              {state.holdings.map((h) => (
                <tr key={h.walletAddress}>
                  <td className="mono">{h.walletAddress}</td>
                  <td className="r">{h.units}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageStack>
  );
}
