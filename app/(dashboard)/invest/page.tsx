/**
 * MARKETPLACE — découverte des opportunités (étude P5, écran 5). RSC.
 *
 * Données : `fetchOpenDeals()` lit les deals `open` en DB (service lib/invest/deal,
 * filtrage tenant_id explicite). Si la DB est vide ou non configurée → FALLBACK
 * `DEMO_DEALS` (moteur financier) + Banner "données de démonstration".
 *
 * Anti-FIA matérialisé :
 *   - L2 : bandeau "l'argent ne bouge jamais avant qu'un deal soit choisi et
 *     signé". Aucun écran "alimenter mon compte".
 *   - L1 : les filtres/tri sont des critères FACTUELS — aucune sélection auto.
 *   - L5 : chaque TRI porte "cible · non garanti" ; disclaimer de risque en pied.
 */
import { Eyebrow, Title, Sub } from "@/components/cockpit/primitives";
import { DealCard, Banner, type DealCardData } from "@/components/invest";
import { eur } from "@/components/invest";
import { DEMO_DEALS } from "./_data/demo";
import { fetchOpenDeals, toDealCardData } from "./_data/server";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const { source, deals: dbDeals } = await fetchOpenDeals();
  const isDemo = source === "demo";

  // Carte = données DB mappées, ou démo en fallback.
  const cards: DealCardData[] = isDemo
    ? DEMO_DEALS.map((d) => ({
        slug: d.slug,
        nom: d.input.nom,
        localisation: d.input.localisation,
        statusTone: d.statusTone,
        statusLabel: d.statusLabel,
        joursRestants: d.joursRestants,
        badges: d.badges,
        triCible: d.sheet.rendement_cible_irr,
        ltv: d.sheet.metrics.ltv,
        dureeMois: d.input.schedule.duree_mois,
        collecteEur: d.collecteEur,
        objectifEur: d.objectifEur,
      }))
    : dbDeals.map(toDealCardData);

  const dealsOuverts = cards.length;
  const collecteTotale = cards.reduce((s, d) => s + d.collecteEur, 0);
  const ticketMin = isDemo
    ? Math.min(...DEMO_DEALS.map((d) => d.input.ticket_min_eur ?? 1_000))
    : Math.min(...dbDeals.map((d) => d.minTicketEur), Infinity);
  const ticketMinAffiche = Number.isFinite(ticketMin) ? ticketMin : 1_000;

  const filtres = [
    "Type : Marchand de biens",
    "Type : Locatif",
    "Durée < 24 mois",
    "LTV < 70 %",
    "Sûreté : Hypothèque",
  ];
  const tris = ["Clôture proche", "TRI cible ↓", "Durée ↑", "LTV ↑", "Récent"];

  return (
    <div className="ct-page-area">
      <Eyebrow>Invest · Opportunités</Eyebrow>
      <Title>Opportunités</Title>
      <Sub>Des obligations de SAS, deal par deal. Vous prêtez à une société — vous n’êtes pas propriétaire du bien.</Sub>

      {isDemo ? (
        <div style={{ marginBottom: "var(--ct-space-md)" }}>
          <Banner tone="warn">
            Données de démonstration (aucun deal ouvert en base). Les chiffres proviennent du moteur
            financier sur des opérations fictives.
          </Banner>
        </div>
      ) : null}

      <div style={{ marginBottom: "var(--ct-space-lg)" }}>
        <Banner tone="info">
          L’argent ne bouge jamais avant que vous ayez choisi et signé un deal. Aucune pré-collecte,
          aucune valeur consolidée : chaque opération est indépendante (1 SPV = 1 deal).
        </Banner>
      </div>

      <div className="ct-kpi-grid cols-4">
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">Deals ouverts</div>
          <div className="ct-kpi-value">{dealsOuverts}</div>
        </div>
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">Collecté (réel)</div>
          <div className="ct-kpi-value">{eur(collecteTotale)}</div>
        </div>
        <div className="ct-kpi-card accent">
          <div className="ct-kpi-label">TRI cible médian · non gar.</div>
          <div className="ct-kpi-value">~9–11 %</div>
        </div>
        <div className="ct-kpi-card">
          <div className="ct-kpi-label">Ticket dès</div>
          <div className="ct-kpi-value">{eur(ticketMinAffiche)}</div>
        </div>
      </div>

      <div className="inv-mk-toolbar">
        <div className="inv-mk-filters" aria-label="Filtres factuels">
          {filtres.map((f) => (
            <span className="inv-chip" key={f}>
              {f}
            </span>
          ))}
        </div>
        <div className="inv-mk-filters" aria-label="Tri (critères factuels)">
          {tris.map((t, i) => (
            <span className={`inv-chip${i === 0 ? " active" : ""}`} key={t}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="inv-deal-grid">
        {cards.map((d) => (
          <DealCard key={d.slug} deal={d} />
        ))}
      </div>

      <p className="inv-fineprint" style={{ marginTop: "var(--ct-space-lg)" }}>
        Tout chiffre de rendement est une cible non garantie. Investir comporte un risque de perte en
        capital et une illiquidité (lock-up jusqu’à l’exit de chaque opération). Le tri propose des
        critères factuels uniquement ; aucune sélection n’est faite à votre place.
      </p>
    </div>
  );
}
