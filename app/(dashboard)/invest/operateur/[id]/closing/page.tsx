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

import type { ReactNode } from "react";
import Link from "next/link";
import { PageStack } from "@/components/cockpit/primitives";
import { Banner, StatusPill, type StatusTone } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { fetchClosingState } from "../../../_data/server";
import { ClosingLauncher } from "./ClosingLauncher";

export const dynamic = "force-dynamic";

const c = UI.invest.operator.closing;

/** Mappe le résultat de réconciliation → ton de pastille. */
function reconTone(result: string, paused: boolean): StatusTone {
  if (paused || result === "chain_exceeds_deep") return "late";
  if (result === "in_sync") return "open";
  if (result === "mint_missing") return "soon";
  return "neutral";
}

/** Page heading — TW+ headings__page-headings/03-with-meta-and-actions (adapté sombre). */
function ClosingHeading({ kicker, title, meta }: { kicker: ReactNode; title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">{kicker}</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
      {meta ? <p className="mt-2 max-w-2xl text-sm text-slate-400">{meta}</p> : null}
    </div>
  );
}

/** Card conteneur — TW+ layout__cards / description-lists (adapté sombre). */
function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20 backdrop-blur-sm">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export default async function ClosingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await fetchClosingState(id);

  if (!state.configured) {
    return (
      <PageStack>
        <ClosingHeading kicker={c.kicker} title={c.title} />
        <Banner tone="warn">{c.dbUnavailable}</Banner>
      </PageStack>
    );
  }
  if (!state.authorized) {
    return (
      <PageStack>
        <ClosingHeading kicker={c.kicker} title={c.title} />
        <Banner tone="warn">{c.unauthorized}</Banner>
      </PageStack>
    );
  }
  if (!state.found) {
    return (
      <PageStack>
        <ClosingHeading kicker={c.kicker} title={c.title} />
        <Banner tone="warn">{c.notFound}</Banner>
        <p className="text-sm text-slate-500">
          <Link href="/invest/operateur" className="text-indigo-300 hover:text-indigo-200">
            {c.backToOperations}
          </Link>
        </p>
      </PageStack>
    );
  }

  const ready = state.conditionsSnapshot.allMet && state.fourEyesApproved;
  const totalUnits = state.holdings.reduce((s, h) => s + h.units, 0);

  const stats = [
    {
      name: c.kpiConditions,
      value: `${state.conditionsSnapshot.total - state.conditionsSnapshot.unmet.length}/${state.conditionsSnapshot.total}`,
      accent: false,
    },
    {
      name: c.kpiFourEyes,
      value: state.fourEyesApproved ? c.kpiFourEyesOk : c.kpiFourEyesRequired,
      accent: state.fourEyesApproved,
    },
    { name: c.kpiFundedSubscriptions, value: String(state.fundedCount), accent: false },
    { name: c.kpiDeepUnits, value: String(totalUnits), accent: false },
  ];

  return (
    <PageStack>
      <ClosingHeading kicker={c.kickerDvp} title={state.dealName} meta={c.headerSub} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-slate-400">
          {c.dealStatusPrefix}
          <StatusPill tone="neutral">{state.dealStatus}</StatusPill>
        </span>
        <Link href={`/invest/${state.dealSlug}`} className="text-sm text-indigo-300 hover:text-indigo-200">
          {c.viewPublicSheet}
        </Link>
      </div>

      {/* ── Bandeau source de vérité ───────────────────────────────────────── */}
      <Banner tone="info">{c.sourceOfTruthBanner}</Banner>

      {/* ── KPIs — TW+ data-display__stats/01-with-trending (adapté sombre) ─── */}
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className={`flex flex-col gap-2 px-4 py-6 sm:px-6 ${stat.accent ? "bg-indigo-500/10" : "bg-white/[0.03]"}`}
          >
            <dt className="text-sm font-medium text-slate-400">{stat.name}</dt>
            <dd className="text-2xl font-medium tracking-tight text-white">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {/* ── Conditions suspensives — TW+ lists__tables/02-simple-in-card ────── */}
      <SectionCard title={c.conditionsTitle}>
        {state.conditions.length === 0 ? (
          <p className="text-sm text-slate-500">{c.conditionsEmpty}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-5 py-2 font-medium">{c.conditionsColCode}</th>
                  <th scope="col" className="px-5 py-2 font-medium">{c.conditionsColLabel}</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">{c.conditionsColState}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {state.conditions.map((cond) => (
                  <tr key={cond.code} className="text-slate-300">
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-400">{cond.code}</td>
                    <td className="px-5 py-2.5">{cond.label}</td>
                    <td className="px-5 py-2.5 text-right">
                      <StatusPill tone={cond.isMet ? "open" : "soon"}>
                        {cond.isMet ? c.conditionMet : c.conditionPending}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Lancement de la saga ───────────────────────────────────────────── */}
      <SectionCard title={c.launchTitle}>
        <p className="mb-3 text-sm text-slate-400">{c.launchIntro}</p>
        <ClosingLauncher dealId={state.dealId} ready={ready} />
      </SectionCard>

      {/* ── Réconciliation DEEP↔chaîne ─────────────────────────────────────── */}
      <SectionCard title={c.reconTitle}>
        {state.lastReconciliation ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            {c.reconLastPass}
            <StatusPill tone={reconTone(state.lastReconciliation.result, state.lastReconciliation.triggeredPause)}>
              {state.lastReconciliation.triggeredPause ? c.reconPaused : state.lastReconciliation.result}
            </StatusPill>
            {state.lastReconciliation.finishedAt
              ? `· ${new Date(state.lastReconciliation.finishedAt).toLocaleString("fr-FR")}`
              : ""}
          </p>
        ) : (
          <p className="text-sm text-slate-500">{c.reconEmpty}</p>
        )}
      </SectionCard>

      {/* ── Registre DEEP (holdings) — TW+ lists__tables/02-simple-in-card ──── */}
      <SectionCard title={c.deepTitle}>
        {state.holdings.length === 0 ? (
          <p className="text-sm text-slate-500">{c.deepEmpty}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-5 py-2 font-medium">{c.deepColHolder}</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">{c.deepColUnits}</th>
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
      </SectionCard>
    </PageStack>
  );
}
