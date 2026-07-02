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
import { PageStack, PageHeader, KpiGrid, KpiCard, Card, Sub } from "@/components/cockpit/primitives";
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
        <p className="text-sm text-slate-500">
          <Link href="/invest/operateur" className="text-indigo-300 hover:text-indigo-200">
            {UI.invest.operator.closing.backToOperations}
          </Link>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-slate-400">
          {UI.invest.operator.closing.dealStatusPrefix}
          <StatusPill tone="neutral">{state.dealStatus}</StatusPill>
        </span>
        <Link href={`/invest/${state.dealSlug}`} className="text-sm text-indigo-300 hover:text-indigo-200">
          {UI.invest.operator.closing.viewPublicSheet}
        </Link>
      </div>

      {/* ── Bandeau source de vérité ───────────────────────────────────────── */}
      <Banner tone="info">{UI.invest.operator.closing.sourceOfTruthBanner}</Banner>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <KpiGrid>
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
      <Card title={UI.invest.operator.closing.conditionsTitle} titleAs="section">
        {state.conditions.length === 0 ? (
          <p className="text-sm text-slate-500">{UI.invest.operator.closing.conditionsEmpty}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2 font-medium">{UI.invest.operator.closing.conditionsColCode}</th>
                  <th className="px-5 py-2 font-medium">{UI.invest.operator.closing.conditionsColLabel}</th>
                  <th className="px-5 py-2 text-right font-medium">{UI.invest.operator.closing.conditionsColState}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {state.conditions.map((c) => (
                  <tr key={c.code} className="text-slate-300">
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-400">{c.code}</td>
                    <td className="px-5 py-2.5">{c.label}</td>
                    <td className="px-5 py-2.5 text-right">
                      <StatusPill tone={c.isMet ? "open" : "soon"}>{c.isMet ? UI.invest.operator.closing.conditionMet : UI.invest.operator.closing.conditionPending}</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Lancement de la saga ───────────────────────────────────────────── */}
      <Card title={UI.invest.operator.closing.launchTitle} titleAs="section">
        <p className="mb-3 text-sm text-slate-400">{UI.invest.operator.closing.launchIntro}</p>
        <ClosingLauncher dealId={state.dealId} ready={ready} />
      </Card>

      {/* ── Réconciliation DEEP↔chaîne ─────────────────────────────────────── */}
      <Card title={UI.invest.operator.closing.reconTitle} titleAs="section">
        {state.lastReconciliation ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            {UI.invest.operator.closing.reconLastPass}
            <StatusPill
              tone={reconTone(state.lastReconciliation.result, state.lastReconciliation.triggeredPause)}
            >
              {state.lastReconciliation.triggeredPause ? UI.invest.operator.closing.reconPaused : state.lastReconciliation.result}
            </StatusPill>
            {state.lastReconciliation.finishedAt
              ? `· ${new Date(state.lastReconciliation.finishedAt).toLocaleString("fr-FR")}`
              : ""}
          </p>
        ) : (
          <p className="text-sm text-slate-500">{UI.invest.operator.closing.reconEmpty}</p>
        )}
      </Card>

      {/* ── Registre DEEP (holdings) ───────────────────────────────────────── */}
      <Card title={UI.invest.operator.closing.deepTitle} titleAs="section">
        {state.holdings.length === 0 ? (
          <p className="text-sm text-slate-500">{UI.invest.operator.closing.deepEmpty}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2 font-medium">{UI.invest.operator.closing.deepColHolder}</th>
                  <th className="px-5 py-2 text-right font-medium">{UI.invest.operator.closing.deepColUnits}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {state.holdings.map((h) => (
                  <tr key={h.walletAddress} className="text-slate-300">
                    <td className="px-5 py-2.5 font-mono text-xs">{h.walletAddress}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{h.units}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageStack>
  );
}
