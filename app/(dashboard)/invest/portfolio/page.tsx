/**
 * PORTEFEUILLE — suivi des positions (étude P12, écran 12). RSC.
 *
 * CRITIQUE anti-FIA (L2) : les positions sont JUXTAPOSÉES par deal, JAMAIS
 * agrégées en une valeur consolidée / NAV. Les KPI additionnent des prêts
 * (faits), ils ne constituent PAS une valorisation de marché ni une part de
 * fonds — disclaimer anti-NAV explicite et permanent.
 *
 * Aucun "rééquilibrage", aucun "réinvestir automatiquement", aucun "solde".
 */
import Link from "next/link";
import { Eyebrow, Title, Sub } from "@/components/cockpit/primitives";
import { ProductBadges, StatusPill, Banner, Timeline, eur, pct } from "@/components/invest";
import { DEMO_POSITIONS } from "../_data/demo";

export default function PortfolioPage() {
  const positions = DEMO_POSITIONS;
  const capitalCumule = positions.reduce((s, p) => s + p.capitalPreteEur, 0);
  const distributionsCumulees = positions.reduce((s, p) => s + p.couponsRecusEur, 0);
  const actives = positions.length;

  // Timeline des exits attendus (lock-up visible) — par deal, jamais agrégé.
  const exits = positions.map((p) => ({
    title: `${p.deal.input.nom}`,
    sub: `Exit attendu ~M${p.deal.input.schedule.duree_mois} · lock-up jusqu'à l'exit de cette opération`,
    state: "active" as const,
  }));

  return (
    <div className="ct-page-area">
      <Eyebrow>Invest · Portefeuille</Eyebrow>
      <Title>Mon portefeuille</Title>
      <Sub>Vos positions, deal par deal. Chaque opération est indépendante (1 SPV = 1 deal).</Sub>

      {/* KPI factuels — PAS une NAV */}
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
          marché ni une part d’un fonds. Il n’existe aucune valeur nette consolidée (pas de NAV), aucun
          rééquilibrage : chaque position se dénoue à l’exit de sa propre opération.
        </Banner>
      </div>

      {/* Positions juxtaposées (card-per-row) */}
      {positions.map((p) => {
        const triCible = p.deal.sheet.rendement_cible_irr;
        return (
          <div className="ct-card" key={p.deal.slug}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--ct-space-md)", flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--ct-space-sm)", flexWrap: "wrap" }}>
                  <span className="inv-pf-deal-name">{p.deal.input.nom}</span>
                  <StatusPill tone={p.statutTone}>{p.statutLabel}</StatusPill>
                </div>
                <ProductBadges badges={p.deal.badges.slice(0, 3)} />
                <div className="inv-fineprint">
                  Capital prêté {eur(p.capitalPreteEur)} · {p.units} obligations · TRI cible{" "}
                  {pct(triCible)} (non garanti) · {p.prochainJalon}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-2xs)", minWidth: "180px", flex: "0 0 200px" }}>
                <div className="inv-progress-meta">
                  <span>Avancement travaux</span>
                  <b>{p.avancementPct}%</b>
                </div>
                <div className="inv-progress-track" role="progressbar" aria-valuenow={p.avancementPct} aria-valuemin={0} aria-valuemax={100} aria-label={`Avancement ${p.deal.input.nom}`}>
                  <div className="inv-progress-fill" style={{ width: `${p.avancementPct}%` }} />
                </div>
                <div className="inv-progress-meta">
                  <span>LTV actuelle</span>
                  <b>{pct(p.ltvActuelle)}</b>
                </div>
                <Link href={`/invest/${p.deal.slug}`} className="inv-doc-row" style={{ color: "var(--ct-accent-strong)", fontWeight: 700, fontSize: "12px", borderBottom: "none" }}>
                  Voir le détail ›
                </Link>
              </div>
            </div>
          </div>
        );
      })}

      {/* Exits attendus (lock-up visible) — par deal */}
      <div className="ct-card">
        <div className="ct-card-title">Exits attendus (par opération · pas de fenêtre de liquidité organisée)</div>
        <Timeline items={exits} />
      </div>

      <p className="inv-fineprint" style={{ marginTop: "var(--ct-space-md)" }}>
        La valeur estimée d’une position n’est pas une NAV de fonds. Fiscalité indicative : intérêts
        obligataires au PFU 31,4 % (2026) ou barème, IFU annuel ; la tokenisation ne crée aucun régime
        fiscal distinct. Consultez votre conseiller.
      </p>
    </div>
  );
}
