// app/(dashboard)/conversion/page.tsx — Cockpit de conversion (server component).
//
// Reconstruit le pipeline commercial RÉEL (leads/estimations/visits/mandates) pour
// un segment (type de prospect) et une période. Aucun chiffre inventé : tout dérive
// de computeConversion sur les lignes DB filtrées user_id + tenant_id.
//
// Auth : la garde serveur du layout (dashboard) protège déjà la route ; on revalide
// getSession() ici pour l'owner-check des lectures. Si absent → état honnête.
import Link from "next/link";
import { PageStack, PageHeader, Card } from "@/components/cockpit/primitives";
import { ConversionFunnel } from "@/components/cockpit/ConversionFunnel";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { fetchConversionSources } from "@/lib/conversion/fetch";
import { computeConversion } from "@/lib/conversion/pipeline";
import { periodBounds, periodLabel } from "@/lib/conversion/period";
import {
  CONVERSION_UI,
  SEGMENT_LABELS,
  GRAIN_LABELS,
  STAGE_LABELS,
  delayLabel,
  pct,
} from "@/lib/conversion/strings";
import type { PeriodGrain, SegmentKind } from "@/lib/conversion/types";

export const dynamic = "force-dynamic";

const SEGMENTS: SegmentKind[] = ["all", "acheteur", "vendeur"];
const GRAINS: PeriodGrain[] = ["month", "quarter"];
const OFFSETS = [0, 1, 2] as const;

type SP = { segment?: string; grain?: string; offset?: string };

function parseSegment(v: string | undefined): SegmentKind {
  return v === "acheteur" || v === "vendeur" ? v : "all";
}
function parseGrain(v: string | undefined): PeriodGrain {
  return v === "quarter" ? "quarter" : "month";
}
function parseOffset(v: string | undefined): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= 0 && n <= 11 ? n : 0;
}

function hrefFor(segment: SegmentKind, grain: PeriodGrain, offset: number): string {
  const p = new URLSearchParams({ segment, grain, offset: String(offset) });
  return `/conversion?${p.toString()}`;
}

/** Pilule de filtre (lien) — active vs inactive, focus clavier visible. */
function FilterPill({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500 ${
        active
          ? "bg-accent-500 text-zinc-950"
          : "surface text-zinc-600 hover:text-zinc-900"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function ConversionPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const segment = parseSegment(sp.segment);
  const grain = parseGrain(sp.grain);
  const offset = parseOffset(sp.offset);

  const claims = await getSession();
  const sb = getGpu1Admin();
  const { from, to } = periodBounds({ grain, offset });

  let report: ReturnType<typeof computeConversion> | null = null;
  let dbUnavailable = false;

  if (claims && sb) {
    const sources = await fetchConversionSources(sb, claims.sub, tenantOf(claims), from, to);
    if (sources === null) {
      dbUnavailable = true;
    } else {
      report = computeConversion(sources, { segment, grain, from, to });
    }
  } else if (!sb) {
    dbUnavailable = true;
  }

  const periodTxt = periodLabel({ grain, offset });

  return (
    <PageStack>
      <PageHeader
        kicker={CONVERSION_UI.navLabel}
        title={CONVERSION_UI.title}
        meta={CONVERSION_UI.subtitle}
        kpis={
          report
            ? [
                { label: CONVERSION_UI.totalLeads, value: report.totalLeads, icon: "leads" },
                { label: CONVERSION_UI.winRate, value: pct(report.winRate), icon: "estimate" },
                { label: CONVERSION_UI.lossRate, value: pct(report.lossRate) },
              ]
            : undefined
        }
      />

      {/* ── Barre de segmentation : type de prospect · granularité · période ── */}
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              {CONVERSION_UI.segment}
            </span>
            {SEGMENTS.map((s) => (
              <FilterPill key={s} active={s === segment} href={hrefFor(s, grain, offset)}>
                {SEGMENT_LABELS[s]}
              </FilterPill>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              {CONVERSION_UI.period}
            </span>
            {GRAINS.map((g) => (
              <FilterPill key={g} active={g === grain} href={hrefFor(segment, g, 0)}>
                {GRAIN_LABELS[g]}
              </FilterPill>
            ))}
            <span aria-hidden className="mx-1 h-4 w-px bg-zinc-950/10" />
            {OFFSETS.map((o) => (
              <FilterPill key={o} active={o === offset} href={hrefFor(segment, grain, o)}>
                {periodLabel({ grain, offset: o })}
              </FilterPill>
            ))}
          </div>
        </div>
      </Card>

      {dbUnavailable ? (
        <Card>
          <p className="py-8 text-center text-sm text-zinc-500">{CONVERSION_UI.unavailable}</p>
        </Card>
      ) : !report || report.totalLeads === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-zinc-500">{CONVERSION_UI.empty}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[1.4fr_1fr]">
          {/* ── Funnel SVG cliquable ── */}
          <Card title={`${CONVERSION_UI.funnelTitle} — ${SEGMENT_LABELS[segment]} · ${periodTxt}`} titleAs="section">
            <ConversionFunnel
              stages={report.stages}
              labels={STAGE_LABELS}
              ui={{ stepRate: CONVERSION_UI.stepRate, openList: CONVERSION_UI.openList }}
              emptyLabel={CONVERSION_UI.empty}
            />
          </Card>

          <div className="flex flex-col gap-6">
            {/* ── Délais médians ── */}
            <Card title={CONVERSION_UI.delaysTitle} titleAs="section">
              <ul className="flex flex-col gap-3">
                {report.delays.map((d) => (
                  <li key={`${d.fromStatus}-${d.toStatus}`} className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-zinc-700">{delayLabel(d.fromStatus, d.toStatus)}</span>
                    <span className="text-right">
                      {d.medianDays !== null ? (
                        <>
                          <span className="text-base font-semibold text-zinc-900 tabular-nums">
                            {CONVERSION_UI.days(d.medianDays)}
                          </span>
                          <span className="ml-2 text-xs text-zinc-400">{CONVERSION_UI.sample(d.sample)}</span>
                        </>
                      ) : (
                        <span className="text-sm text-zinc-400">{CONVERSION_UI.noDelay}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* ── Pertes par étage ── */}
            <Card title={CONVERSION_UI.lossesTitle} titleAs="section">
              <ul className="flex flex-col gap-2.5">
                {report.losses.map((loss) => (
                  <li key={loss.stage} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-zinc-700">{STAGE_LABELS[loss.stage]}</span>
                      <span className="font-semibold text-zinc-900 tabular-nums">{loss.lost}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-950/10">
                      <div
                        className="h-full rounded-full bg-accent-500/70"
                        // largeur pilotée par la donnée réelle → seul style inline
                        style={{ width: `${Math.round(loss.share * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </PageStack>
  );
}
