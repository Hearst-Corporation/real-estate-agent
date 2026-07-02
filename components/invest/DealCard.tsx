/**
 * DealCard — carte d'un deal sur la marketplace (étude P5/P8). Server component.
 * <article> avec titre <h3> (a11y). Vignette SVG (skyline) + StatusPill + J-,
 * jeu de badges, 3 métriques factuelles (TRI cible / LTV / durée), barre de
 * levée. Le tri/affichage AIDE à trouver, jamais à décider (L1) : aucun "score
 * plateforme", aucun "recommandé".
 *
 * Tout chiffre de rendement porte "cible · non garanti" (L5).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusPill, type StatusTone } from "./StatusPill";
import { ProductBadges, type ProductBadge } from "./ProductBadges";
import { IconPin } from "./icons";
import { compact, pct } from "./format";
import { DEAL_BADGES_MAX } from "@/lib/invest/constants";

export interface DealCardData {
  slug: string;
  nom: string;
  localisation: string;
  statusTone: StatusTone;
  statusLabel: string;
  joursRestants: number | null;
  badges: ProductBadge[];
  /** TRI cible (scénario central) — NON GARANTI. `null` si non calculable. */
  triCible: number | null;
  ltv: number;
  dureeMois: number;
  collecteEur: number;
  objectifEur: number;
}

function Skyline() {
  return (
    <svg
      className="absolute inset-x-0 bottom-0 h-full w-full text-slate-950/60"
      viewBox="0 0 300 70"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M0 70 V40 h20 V52 h14 V30 h22 V46 h16 V22 h24 V44 h18 V34 h20 V50 h16 V26 h26 V48 h18 V38 h22 V52 h16 V44 h32 V70 Z"
      />
    </svg>
  );
}

export function DealCard({ deal }: { deal: DealCardData }): ReactNode {
  const taux = deal.objectifEur > 0 ? Math.round((deal.collecteEur / deal.objectifEur) * 100) : 0;
  const fillW = Math.max(0, Math.min(100, taux));

  return (
    <article>
      <Link
        className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20 backdrop-blur-sm transition hover:border-white/20 hover:bg-white/[0.05]"
        href={`/invest/${deal.slug}`}
        aria-label={`Voir le deal ${deal.nom}`}
      >
        <div className="relative h-[150px] overflow-hidden bg-gradient-to-br from-indigo-500/20 via-slate-900 to-slate-900">
          <Skyline />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
            <StatusPill tone={deal.statusTone}>{deal.statusLabel}</StatusPill>
            {deal.joursRestants != null ? (
              <span className="rounded-full border border-white/10 bg-slate-950/60 px-2 py-1 text-xs font-medium text-slate-200 backdrop-blur-sm">
                J-{deal.joursRestants}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <IconPin width={12} height={12} />
            {deal.localisation}
          </div>
          <h3 className="text-base font-semibold text-white">{deal.nom}</h3>
          <ProductBadges badges={deal.badges.slice(0, DEAL_BADGES_MAX)} />
          <div className="mt-1 grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-indigo-300">{pct(deal.triCible)}</span>
              <span className="text-[11px] text-slate-500">TRI cible · non gar.</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-slate-100">{pct(deal.ltv)}</span>
              <span className="text-[11px] text-slate-500">LTV</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-slate-100">{deal.dureeMois} mois</span>
              <span className="text-[11px] text-slate-500">Durée</span>
            </div>
          </div>
          <div className="mt-2">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
              role="progressbar"
              aria-valuenow={taux}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Avancement de la levée"
            >
              <div className="h-full rounded-full bg-indigo-400" style={{ width: `${fillW}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
              <b className="text-slate-200">{taux}%</b>
              <span>
                {compact(deal.collecteEur)} / {compact(deal.objectifEur)} €
              </span>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
