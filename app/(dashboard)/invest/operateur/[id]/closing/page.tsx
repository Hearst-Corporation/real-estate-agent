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
        <PageHeader kicker="Invest · Back-office · Closing" title="Closing du deal" />
        <Banner tone="warn">Base de données non configurée — closing indisponible.</Banner>
      </PageStack>
    );
  }
  if (!state.authorized) {
    return (
      <PageStack>
        <PageHeader kicker="Invest · Back-office · Closing" title="Closing du deal" />
        <Banner tone="warn">
          Accès réservé aux opérateurs, à l&apos;administration et à la conformité. Investir comporte
          un risque de perte en capital ; les rendements affichés sont non garantis.
        </Banner>
      </PageStack>
    );
  }
  if (!state.found) {
    return (
      <PageStack>
        <PageHeader kicker="Invest · Back-office · Closing" title="Closing du deal" />
        <Banner tone="warn">Deal introuvable pour ce tenant.</Banner>
        <p className="inv-chart-foot">
          <Link href="/invest/operateur">← Retour aux opérations</Link>
        </p>
      </PageStack>
    );
  }

  const ready = state.conditionsSnapshot.allMet && state.fourEyesApproved;
  const totalUnits = state.holdings.reduce((s, h) => s + h.units, 0);

  return (
    <PageStack>
      <PageHeader
        kicker="Invest · Back-office · Closing (DvP)"
        title={state.dealName}
        meta={
          <Sub>
            Closing en livraison-contre-paiement : inscription au registre DEEP (source de vérité)
            d&apos;abord, puis miroir on-chain, réconciliation, et libération du séquestre en dernier.
            Le porteur est créancier obligataire ; rendement non garanti, risque de perte en capital.
          </Sub>
        }
      />

      <div className="inv-mk-toolbar inv-toolbar-between">
        <span>
          Statut du deal : <StatusPill tone="neutral">{state.dealStatus}</StatusPill>
        </span>
        <Link href={`/invest/${state.dealSlug}`} className="inv-doc-name">
          Voir la fiche publique
        </Link>
      </div>

      {/* ── Bandeau source de vérité ───────────────────────────────────────── */}
      <Banner tone="info">
        DEEP = source de vérité juridique (Ord. 2017-1674). Le token ERC-3643 n&apos;en est que le
        miroir : en cas de divergence, le DEEP prime ; une position on-chain supérieure au DEEP met
        la saga en pause (escalade conformité).
      </Banner>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <KpiGrid className="cols-4 inv-kpi-my">
        <KpiCard
          label="Conditions suspensives"
          value={`${state.conditionsSnapshot.total - state.conditionsSnapshot.unmet.length}/${state.conditionsSnapshot.total}`}
        />
        <KpiCard
          label="Double validation (4-eyes)"
          value={state.fourEyesApproved ? "OK" : "Requise"}
          accent={state.fourEyesApproved}
        />
        <KpiCard
          label="Souscriptions financées"
          value={String(state.fundedCount)}
        />
        <KpiCard
          label="Obligations inscrites (DEEP)"
          value={String(totalUnits)}
        />
      </KpiGrid>

      {/* ── Conditions suspensives ─────────────────────────────────────────── */}
      <div className="inv-chart-card inv-chart-mb">
        <h3 className="inv-chart-title">Conditions suspensives</h3>
        {state.conditions.length === 0 ? (
          <p className="inv-chart-foot">Aucune condition suspensive paramétrée pour ce deal.</p>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Libellé</th>
                <th className="r">État</th>
              </tr>
            </thead>
            <tbody>
              {state.conditions.map((c) => (
                <tr key={c.code}>
                  <td>{c.code}</td>
                  <td>{c.label}</td>
                  <td className="r">
                    <StatusPill tone={c.isMet ? "open" : "soon"}>{c.isMet ? "remplie" : "en attente"}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Lancement de la saga ───────────────────────────────────────────── */}
      <div className="inv-chart-card inv-chart-mb">
        <h3 className="inv-chart-title">Lancer le closing (DvP)</h3>
        <p className="inv-chart-foot inv-chart-intro">
          Ordre exécuté : fonds en séquestre confirmés → inscription DEEP → mint miroir (idempotent) →
          réconciliation → libération du séquestre vers le SPV (en dernier). En cas d&apos;échec avant
          la libération, remboursement intégral des souscriptions.
        </p>
        <ClosingLauncher dealId={state.dealId} ready={ready} />
      </div>

      {/* ── Réconciliation DEEP↔chaîne ─────────────────────────────────────── */}
      <div className="inv-chart-card inv-chart-mb">
        <h3 className="inv-chart-title">Réconciliation DEEP ↔ chaîne</h3>
        {state.lastReconciliation ? (
          <p className="inv-chart-foot">
            Dernière passe :{" "}
            <StatusPill
              tone={reconTone(state.lastReconciliation.result, state.lastReconciliation.triggeredPause)}
            >
              {state.lastReconciliation.triggeredPause ? "pause (chaîne > DEEP)" : state.lastReconciliation.result}
            </StatusPill>{" "}
            {state.lastReconciliation.finishedAt
              ? `· ${new Date(state.lastReconciliation.finishedAt).toLocaleString("fr-FR")}`
              : ""}
          </p>
        ) : (
          <p className="inv-chart-foot">
            Aucune passe enregistrée. Sans indexer chaîne branché, la réconciliation reste « legal_only »
            (le registre DEEP fait foi seul).
          </p>
        )}
      </div>

      {/* ── Registre DEEP (holdings) ───────────────────────────────────────── */}
      <div className="inv-chart-card">
        <h3 className="inv-chart-title">Registre DEEP — positions (source de vérité)</h3>
        {state.holdings.length === 0 ? (
          <p className="inv-chart-foot">Aucune position inscrite. Le registre se remplit à l&apos;étape DEEP du closing.</p>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                <th>Porteur (créancier)</th>
                <th className="r">Obligations</th>
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
