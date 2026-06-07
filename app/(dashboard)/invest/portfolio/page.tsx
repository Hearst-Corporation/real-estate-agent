/**
 * PORTEFEUILLE — suivi des positions (étude P12, écran 12). RSC, branché DB.
 *
 * CRITIQUE anti-FIA (L2) : les positions sont JUXTAPOSÉES par deal, JAMAIS
 * agrégées en une valeur consolidée. Les KPI additionnent des prêts (faits), ils
 * ne constituent PAS une valorisation de marché ni une part de fonds — disclaimer
 * anti-valeur-consolidée explicite et permanent.
 *
 * Aucun "rééquilibrage", aucun "réinvestir automatiquement", aucun "solde". Une
 * distribution reçue = paiement d'une créance (coupon / remboursement), variable
 * et non garanti — pas un rendement servi sur un pool.
 *
 * Source : `fetchMyPortfolio()` (souscriptions allocated|minted + holdings DEEP +
 * payouts reçus, par deal). DB vide / non configurée → fallback démonstration
 * (Banner "démonstration"), pour ne jamais afficher d'écran blanc.
 */
import Link from "next/link";
import { Eyebrow, Title, Sub } from "@/components/cockpit/primitives";
import { ProductBadges, StatusPill, Banner, Timeline, eur, pct } from "@/components/invest";
import type { StatusTone } from "@/components/invest";
import { DEMO_POSITIONS } from "../_data/demo";
import { fetchMyPortfolio, type PortfolioPositionView } from "../_data/server";

/** Libellé FR du type de distribution (présentation). */
const DISTRIB_LABEL: Record<string, string> = {
  coupon: "Coupon",
  principal: "Remboursement",
  principal_partial: "Remboursement partiel",
  performance: "Prime de performance",
  final: "Versement de sortie",
};

export default async function PortfolioPage() {
  const portfolio = await fetchMyPortfolio();
  const isDemo = portfolio.source === "demo";

  // Normalise DB ⇄ démo vers une forme d'affichage unique (toujours par deal).
  const positions: PortfolioPositionView[] = isDemo
    ? DEMO_POSITIONS.map((p) => ({
        dealId: p.deal.slug,
        dealSlug: p.deal.slug,
        dealName: p.deal.input.nom,
        localisation: p.deal.input.localisation,
        capitalPreteEur: p.capitalPreteEur,
        units: p.units,
        distributionsRecuesEur: p.couponsRecusEur,
        triCible: p.deal.sheet.rendement_cible_irr,
        ltv: p.ltvActuelle,
        dureeMois: p.deal.input.schedule.duree_mois,
        statutTone: p.statutTone as StatusTone as PortfolioPositionView["statutTone"],
        statutLabel: p.statutLabel,
        badges: p.deal.badges.slice(0, 3),
      }))
    : portfolio.positions;

  // KPI FACTUELS — addition de prêts, surtout PAS une valeur consolidée.
  const capitalCumule = positions.reduce((s, p) => s + p.capitalPreteEur, 0);
  const distributionsCumulees = positions.reduce((s, p) => s + p.distributionsRecuesEur, 0);
  const actives = positions.length;

  // Timeline des exits attendus (lock-up visible) — par deal, jamais agrégé.
  const exits = positions.map((p) => ({
    title: p.dealName,
    sub: `Exit attendu ~M${p.dureeMois} · lock-up jusqu'à l'exit de cette opération`,
    state: "active" as const,
  }));

  // Liste des distributions reçues (détail), uniquement en mode DB.
  const payouts = isDemo ? [] : portfolio.payouts;

  return (
    <div className="ct-page-area">
      <Eyebrow>Invest · Portefeuille</Eyebrow>
      <Title>Mon portefeuille</Title>
      <Sub>Vos positions, deal par deal. Chaque opération est indépendante (1 SPV = 1 deal).</Sub>

      {isDemo && (
        <div style={{ marginBottom: "var(--ct-space-md)" }}>
          <Banner tone="info">
            Données de démonstration : vous n’avez pas encore de position. Les chiffres ci-dessous
            illustrent l’affichage ; ils ne reflètent aucun engagement réel.
          </Banner>
        </div>
      )}

      {/* KPI factuels — addition de prêts, pas une valeur consolidée */}
      <div className="ct-kpi-grid cols-3">
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">Capital prêté (cumul)</div>
          <div className="ct-kpi-value">{eur(capitalCumule)}</div>
        </div>
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">Positions actives</div>
          <div className="ct-kpi-value">{actives}</div>
        </div>
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">Distributions reçues</div>
          <div className="ct-kpi-value">{eur(distributionsCumulees)}</div>
        </div>
      </div>

      <div style={{ marginBottom: "var(--ct-space-lg)" }}>
        <Banner tone="warn">
          Ces montants additionnent vos prêts ; ils ne constituent <b>pas</b> une valorisation de
          marché ni une part d’un fonds. Il n’existe aucune valeur nette consolidée, aucun
          rééquilibrage : chaque position se dénoue à l’exit de sa propre opération.
        </Banner>
      </div>

      {/* Positions juxtaposées (card-per-row) */}
      {positions.map((p) => (
        <div className="ct-card" key={p.dealId}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--ct-space-md)", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--ct-space-sm)", flexWrap: "wrap" }}>
                <span className="inv-pf-deal-name">{p.dealName}</span>
                <StatusPill tone={p.statutTone}>{p.statutLabel}</StatusPill>
              </div>
              <ProductBadges badges={p.badges} />
              <div className="inv-fineprint">
                Capital prêté {eur(p.capitalPreteEur)} · {p.units} obligations · TRI cible{" "}
                {pct(p.triCible)} (non garanti) · distributions reçues {eur(p.distributionsRecuesEur)}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-2xs)", minWidth: "180px", flex: "0 0 200px" }}>
              <div className="inv-progress-meta">
                <span>LTV actuelle</span>
                <b>{p.ltv != null ? pct(p.ltv) : "—"}</b>
              </div>
              <Link href={`/invest/${p.dealSlug}`} className="inv-doc-row" style={{ color: "var(--ct-accent-strong)", fontWeight: "var(--ct-fw-bold)", fontSize: "var(--ct-fs-sm)", borderBottom: "none" }}>
                Voir le détail ›
              </Link>
            </div>
          </div>
        </div>
      ))}

      {/* Distributions reçues (détail par versement) — mode DB uniquement */}
      {payouts.length > 0 && (
        <div className="ct-card">
          <div className="ct-card-title">Distributions reçues (paiement d’une créance · variable, non garanti)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-xs)" }}>
            {payouts.map((po) => (
              <div key={po.id} className="inv-doc-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--ct-space-sm)" }}>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontWeight: "var(--ct-fw-semibold)" }}>{po.dealName ?? "Opération"}</span>
                  <span className="inv-fineprint">
                    {DISTRIB_LABEL[po.distributionType ?? ""] ?? "Versement"} · {po.unitsHeld} obligations
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--ct-space-sm)" }}>
                  <b>{eur(po.netAmountEur)}</b>
                  <StatusPill tone={po.status === "paid" ? "funded" : po.status === "pending" ? "soon" : "late"}>
                    {po.status === "paid" ? "Versé" : po.status === "pending" ? "En attente" : po.status}
                  </StatusPill>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exits attendus (lock-up visible) — par deal */}
      <div className="ct-card">
        <div className="ct-card-title">Exits attendus (par opération · pas de fenêtre de liquidité organisée)</div>
        <Timeline items={exits} />
      </div>

      <p className="inv-fineprint" style={{ marginTop: "var(--ct-space-md)" }}>
        La valeur estimée d’une position n’est pas une valeur nette consolidée. Fiscalité indicative :
        intérêts obligataires au PFU 31,4 % (2026) ou barème, IFU annuel ; la tokenisation ne crée
        aucun régime fiscal distinct. Consultez votre conseiller.
      </p>
    </div>
  );
}
