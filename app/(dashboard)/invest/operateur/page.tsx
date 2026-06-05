/**
 * BACK-OFFICE OPÉRATEUR — liste des deals de l'opérateur + statut. RSC.
 *
 * Réservé aux opérateurs/admin (garde serveur via `fetchOperatorDeals`). Affiche
 * tous les deals du tenant (tous statuts), avec leur avancement de levée, et un
 * lien vers le wizard de création.
 *
 * Anti-FIA : c'est un outil de GESTION de deals indépendants (1 SPV = 1 deal) ;
 * aucune vue agrégée/portefeuille consolidé. Rendements = cibles non garanties.
 */
import Link from "next/link";
import { Eyebrow, Title, Sub } from "@/components/cockpit/primitives";
import { Banner, StatusPill, eur, pct, type StatusTone } from "@/components/invest";
import { fetchOperatorDeals } from "../_data/server";

/** Mappe un statut DB de deal → ton de pastille. */
function statusTone(status: string): StatusTone {
  switch (status) {
    case "open":
      return "open";
    case "draft":
      return "soon";
    case "funded":
    case "closing":
    case "live":
    case "distributing":
      return "open";
    case "cancelled":
    case "defaulted":
      return "late";
    default:
      return "closed";
  }
}

export const dynamic = "force-dynamic";

export default async function OperateurPage() {
  const { authorized, configured, deals } = await fetchOperatorDeals();

  return (
    <div className="ct-page-area">
      <Eyebrow>Invest · Back-office opérateur</Eyebrow>
      <Title>Mes opérations</Title>
      <Sub>Gérez vos deals deal par deal (1 SPV = 1 opération). Les rendements affichés sont des cibles non garanties.</Sub>

      {!configured ? (
        <Banner tone="warn">Base de données non configurée — back-office indisponible.</Banner>
      ) : !authorized ? (
        <Banner tone="warn">
          Accès réservé aux opérateurs et administrateurs. Vous êtes créancier/investisseur :
          consultez les <Link href="/invest">opportunités</Link>. Investir comporte un risque de
          perte en capital.
        </Banner>
      ) : (
        <>
          <div className="inv-mk-toolbar" style={{ justifyContent: "flex-end" }}>
            <Link href="/invest/operateur/nouveau" className="inv-btn-reserve" style={{ textDecoration: "none", display: "inline-block" }}>
              + Nouveau deal
            </Link>
          </div>

          <div className="ct-kpi-grid cols-4" style={{ marginBottom: "var(--ct-space-lg)" }}>
            <div className="ct-kpi-card">
              <div className="ct-kpi-label">Deals (total)</div>
              <div className="ct-kpi-value">{deals.length}</div>
            </div>
            <div className="ct-kpi-card accent">
              <div className="ct-kpi-label">Ouverts</div>
              <div className="ct-kpi-value">{deals.filter((d) => d.status === "open").length}</div>
            </div>
            <div className="ct-kpi-card">
              <div className="ct-kpi-label">Brouillons</div>
              <div className="ct-kpi-value">{deals.filter((d) => d.status === "draft").length}</div>
            </div>
            <div className="ct-kpi-card">
              <div className="ct-kpi-label">Objectif cumulé</div>
              <div className="ct-kpi-value">{eur(deals.reduce((s, d) => s + d.targetRaiseEur, 0))}</div>
            </div>
          </div>

          {deals.length === 0 ? (
            <div className="inv-chart-card">
              <p className="inv-chart-foot">
                Aucun deal pour le moment. Créez votre première opération — un SPV (SAS) dédié et une
                tranche obligataire seront créés. La publication exige un KIIS publié.
              </p>
            </div>
          ) : (
            <div className="inv-chart-card">
              <table className="inv-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "var(--ct-space-2xs)" }}>Deal</th>
                    <th style={{ textAlign: "left", padding: "var(--ct-space-2xs)" }}>Type</th>
                    <th style={{ textAlign: "left", padding: "var(--ct-space-2xs)" }}>Statut</th>
                    <th style={{ textAlign: "right", padding: "var(--ct-space-2xs)" }}>Levé / Objectif</th>
                    <th style={{ textAlign: "right", padding: "var(--ct-space-2xs)" }}>TRI cible · non gar.</th>
                    <th style={{ textAlign: "right", padding: "var(--ct-space-2xs)" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((d) => {
                    const taux = d.targetRaiseEur > 0 ? Math.round((d.raisedEur / d.targetRaiseEur) * 100) : 0;
                    return (
                      <tr key={d.id} style={{ borderTop: "1px solid var(--ct-border)" }}>
                        <td style={{ padding: "var(--ct-space-2xs)" }}>
                          <Link href={`/invest/${d.slug}`} className="inv-doc-name">
                            {d.name}
                          </Link>
                        </td>
                        <td style={{ padding: "var(--ct-space-2xs)" }}>{d.dealType}</td>
                        <td style={{ padding: "var(--ct-space-2xs)" }}>
                          <StatusPill tone={statusTone(d.status)}>{d.status}</StatusPill>
                        </td>
                        <td style={{ padding: "var(--ct-space-2xs)", textAlign: "right" }}>
                          {eur(d.raisedEur)} / {eur(d.targetRaiseEur)} ({taux}%)
                        </td>
                        <td style={{ padding: "var(--ct-space-2xs)", textAlign: "right" }}>
                          {pct(d.targetIrrPct != null ? d.targetIrrPct / 100 : null)}
                        </td>
                        <td style={{ padding: "var(--ct-space-2xs)", textAlign: "right" }}>
                          <Link href={`/invest/${d.slug}`}>Voir la fiche</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="inv-fineprint" style={{ marginTop: "var(--ct-space-lg)" }}>
            Chaque opération est indépendante (1 SPV = 1 deal) ; aucune mutualisation. Les versements
            transitent par un séquestre tiers, jamais par la plateforme. Tout rendement est une cible
            non garantie ; risque de perte en capital pour les créanciers obligataires.
          </p>
        </>
      )}
    </div>
  );
}
