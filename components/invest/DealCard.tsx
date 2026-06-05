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
    <svg className="inv-deal-thumb-skyline" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden
      style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "70px", opacity: 0.5 }}>
      <path
        fill="var(--ct-bg-deep)"
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
      <Link className="inv-deal-card" href={`/invest/${deal.slug}`} aria-label={`Voir le deal ${deal.nom}`}>
        <div className="inv-deal-thumb">
          <Skyline />
          <div className="inv-deal-thumb-top">
            <StatusPill tone={deal.statusTone}>{deal.statusLabel}</StatusPill>
            {deal.joursRestants != null ? (
              <span className="inv-deal-jdays">J-{deal.joursRestants}</span>
            ) : null}
          </div>
        </div>
        <div className="inv-deal-body">
          <div className="inv-deal-loc">
            <IconPin width={12} height={12} />
            {deal.localisation}
          </div>
          <h3 className="inv-deal-name">{deal.nom}</h3>
          <ProductBadges badges={deal.badges.slice(0, 3)} />
          <div className="inv-deal-metrics">
            <div className="inv-deal-metric">
              <span className="inv-m-val accent">{pct(deal.triCible)}</span>
              <span className="inv-m-lab">TRI cible · non gar.</span>
            </div>
            <div className="inv-deal-metric">
              <span className="inv-m-val">{pct(deal.ltv)}</span>
              <span className="inv-m-lab">LTV</span>
            </div>
            <div className="inv-deal-metric">
              <span className="inv-m-val">{deal.dureeMois} mois</span>
              <span className="inv-m-lab">Durée</span>
            </div>
          </div>
          <div className="inv-deal-progress">
            <div className="inv-progress-track" role="progressbar" aria-valuenow={taux} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement de la levée">
              <div className="inv-progress-fill" style={{ width: `${fillW}%` }} />
            </div>
            <div className="inv-progress-meta">
              <b>{taux}%</b>
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
