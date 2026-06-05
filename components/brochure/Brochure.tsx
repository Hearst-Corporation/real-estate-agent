// Brochure.tsx — Server-safe (pas de 'use client', pas de hooks)
// Rendu statique pour export PDF A4. 9 sections comme <section className="sheet">.

import React from 'react';
import type { Estimation, ValuationAdjustment, DvfComparable, ListingComparable, PropertyData, MarketAnalysis } from '@/lib/estimation/types';

// ── Helpers de formatage ─────────────────────────────────────────────────────

/** Formatage euro avec espace fine U+202F */
function formatEUR(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    // Intl met déjà une espace fine en fr-FR mais on force le séparateur
  }).format(n);
}

/** Surface m² */
function formatM2(n: number | null): string {
  if (n == null) return '—';
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)} m²`;
}

/** Prix par m² */
function formatPpm2(n: number | null): string {
  if (n == null) return '—';
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)} € / m²`;
}

/** Formatage montant brut avec espace fine (sans symbole €, pour la scale) */
function formatAmount(n: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)} €`;
}

/** Formatage date mutation DVF → MM/AAAA */
function formatDateMutation(d: string): string {
  try {
    const dt = new Date(d);
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${mm}/${yyyy}`;
  } catch {
    return d;
  }
}

/** Libellé lisible du type de bien */
function labelTypeBien(t: PropertyData['type_bien']): string {
  const map: Record<NonNullable<PropertyData['type_bien']>, string> = {
    appartement: 'Appartement',
    maison: 'Maison',
    immeuble: 'Immeuble',
    local_commercial: 'Local commercial',
    terrain: 'Terrain',
    autre: 'Autre',
  };
  return t ? map[t] : '—';
}

/** Libellé exposition */
function labelExposition(e: PropertyData['exposition']): string {
  if (!e) return '—';
  const map: Record<NonNullable<PropertyData['exposition']>, string> = {
    nord: 'Nord', sud: 'Sud', est: 'Est', ouest: 'Ouest',
    sud_est: 'Sud-Est', sud_ouest: 'Sud-Ouest',
    nord_est: 'Nord-Est', nord_ouest: 'Nord-Ouest',
    traversant: 'Traversant',
  };
  return map[e];
}

/** Libellé état général */
function labelEtat(e: PropertyData['etat_general']): string {
  if (!e) return '—';
  const map: Record<NonNullable<PropertyData['etat_general']>, string> = {
    a_renover: 'À rénover',
    rafraichissement: 'Rafraîchissement',
    bon: 'Bon état',
    renove_recemment: 'Rénové récemment',
    neuf: 'Neuf',
  };
  return map[e];
}

/** Libellé stationnement */
function labelStationnement(s: PropertyData['stationnement']): string {
  if (!s) return '—';
  const map: Record<NonNullable<PropertyData['stationnement']>, string> = {
    aucun: 'Aucun',
    place_exterieure: 'Place extérieure',
    place_sous_sol: 'Place en sous-sol',
    box: 'Box',
    garage: 'Garage',
    plusieurs: 'Plusieurs emplacements',
  };
  return map[s];
}

// ── Position du point sur l'échelle (0–100) ─────────────────────────────────
function scalePct(low: number, market: number, high: number): number {
  const range = high - low;
  if (range <= 0) return 50;
  return Math.round(((market - low) / range) * 100);
}

// ── Filtre des champs field_status === 'to_confirm' ──────────────────────────
function getToConfirmFields(
  estimation: Estimation
): Array<{ field: string; label: string }> {
  const LABELS: Partial<Record<keyof PropertyData, string>> = {
    surface_habitable_m2: 'Surface habitable',
    surface_carrez_m2: 'Surface Carrez',
    etage: 'Étage',
    nombre_pieces: 'Nombre de pièces',
    nombre_chambres: 'Nombre de chambres',
    dpe_classe: 'Classe DPE',
    ges_classe: 'Classe GES',
    etat_general: 'État général',
    exposition: 'Exposition',
    terrasse_balcon_m2: 'Surface terrasse / balcon',
    jardin_m2: 'Surface jardin',
    charges_annuelles_eur: 'Charges annuelles',
    travaux_votes: 'Travaux votés',
    stationnement: 'Stationnement',
    occupation: 'Occupation',
  };
  const result: Array<{ field: string; label: string }> = [];
  for (const [field, status] of Object.entries(estimation.fieldStatus)) {
    if (status === 'to_confirm') {
      const label = LABELS[field as keyof PropertyData] ?? field;
      result.push({ field, label });
    }
  }
  return result;
}

// ── Sous-composants ─────────────────────────────────────────────────────────

function CoverSheet({ estimation }: { estimation: Estimation }): React.JSX.Element {
  const { property, branding } = estimation;
  const monogram = (branding?.monogram as string | undefined) ?? 'M';
  const adresse = [property.adresse, property.code_postal && property.ville
    ? `${property.code_postal} ${property.ville}`
    : property.ville ?? ''].filter(Boolean).join(', ');

  return (
    <section className="sheet cover">
      <div className="cover-inner">
        <div className="cover-top">
          <div className="monogram">{monogram}</div>
          <div className="cover-ref">Confidentiel</div>
        </div>

        <div className="cover-photo">
          <span className="cover-photo-placeholder">Vue du bien</span>
        </div>

        <div className="cover-body">
          <div className="cover-overline">Avis de Valeur</div>
          <h1 className="cover-title">
            Avis de <em>Valeur</em>
          </h1>
          <div className="cover-addr">{adresse || 'Adresse non renseignée'}</div>
        </div>
      </div>
    </section>
  );
}

function SyntheseSheet({ estimation }: { estimation: Estimation }): React.JSX.Element {
  const { property, valuation } = estimation;
  if (!valuation) return <></>;

  const { marketValue, lowValue, highValue, adjustedPerM2 } = valuation;
  const surface = property.surface_carrez_m2 ?? property.surface_habitable_m2;
  const dotPct = scalePct(lowValue, marketValue, highValue);

  return (
    <section className="sheet">
      <div className="section-head">
        <span className="overline">{"Synthèse de l’estimation"}</span>
        <h2>Valeur de marché</h2>
      </div>

      <div className="value-bar">
        <div className="value-row">
          <div className="value-main">
            <div className="lbl">Valeur de marché</div>
            <div className="amt num">
              {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(marketValue)}
              <span className="cur">&thinsp;€</span>
            </div>
          </div>
          {surface != null && (
            <div className="value-ppm">
              <div className="v">{formatPpm2(adjustedPerM2)}</div>
              <div className="k">
                surface — {formatM2(surface)}
                {property.surface_carrez_m2 != null ? ' Carrez' : ' habitable'}
              </div>
            </div>
          )}
        </div>

        <div className="scale">
          <div className="scale-track">
            <div className="scale-tick" style={{ left: '0' }} />
            <div className="scale-tick" style={{ left: '50%' }} />
            <div className="scale-tick" style={{ left: '100%' }} />
            <div className="scale-dot" style={{ left: `${dotPct}%` }} />
          </div>
          <div className="scale-labels num">
            <span>{formatAmount(lowValue)}</span>
            <span className="mid">Valeur de marché</span>
            <span>{formatAmount(highValue)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PresentationSheet({ estimation }: { estimation: Estimation }): React.JSX.Element {
  const { property, valuation } = estimation;

  // Points forts : uniquement les adjustments de type 'premium'
  const premiumPoints: ValuationAdjustment[] = (valuation?.adjustments ?? []).filter(
    (a) => a.type === 'premium'
  );

  const surfaceLabel = property.surface_carrez_m2 != null
    ? `${formatM2(property.surface_carrez_m2)} Carrez`
    : formatM2(property.surface_habitable_m2);

  const etageLabel = property.etage != null
    ? property.nb_etages_total != null
      ? `${property.etage}e sur ${property.nb_etages_total}${property.ascenseur ? ' · ascenseur' : ''}`
      : `${property.etage}e étage`
    : null;

  const piecesLabel = property.nombre_pieces != null
    ? property.nombre_chambres != null
      ? `${property.nombre_pieces} — dont ${property.nombre_chambres} chambre${property.nombre_chambres > 1 ? 's' : ''}`
      : String(property.nombre_pieces)
    : null;

  const annexesLabel = [
    property.terrasse_balcon_m2 != null ? `Terrasse / balcon ${formatM2(property.terrasse_balcon_m2)}` : null,
    property.jardin_m2 != null ? `Jardin ${formatM2(property.jardin_m2)}` : null,
    property.cave ? `Cave${property.cave_surface_m2 != null ? ` ${formatM2(property.cave_surface_m2)}` : ''}` : null,
    property.stationnement && property.stationnement !== 'aucun'
      ? labelStationnement(property.stationnement)
      : null,
  ].filter(Boolean).join(' · ') || null;

  const kvPairs: Array<{ dt: string; dd: string }> = [
    property.type_bien ? { dt: 'Type', dd: labelTypeBien(property.type_bien) } : null,
    { dt: 'Surface', dd: surfaceLabel },
    piecesLabel ? { dt: 'Pièces', dd: piecesLabel } : null,
    etageLabel ? { dt: 'Étage', dd: etageLabel } : null,
    property.exposition ? { dt: 'Exposition', dd: labelExposition(property.exposition) } : null,
    property.vue ? { dt: 'Vue', dd: property.vue } : null,
    property.etat_general ? { dt: 'État', dd: labelEtat(property.etat_general) } : null,
    property.dpe_classe ? { dt: 'DPE', dd: property.dpe_classe } : null,
    annexesLabel ? { dt: 'Annexes', dd: annexesLabel } : null,
    property.charges_annuelles_eur != null
      ? { dt: 'Charges annuelles', dd: formatEUR(property.charges_annuelles_eur) }
      : null,
  ].filter((x): x is { dt: string; dd: string } => x != null);

  return (
    <section className="sheet">
      <div className="section-head">
        <span className="overline">Présentation du bien</span>
        <h2>
          {property.type_bien ? labelTypeBien(property.type_bien) : 'Le bien'}
          {property.adresse ? ` — ${property.adresse}` : ''}
        </h2>
      </div>

      <div className="kv">
        {kvPairs.map(({ dt, dd }, i) => (
          <dl key={i}>
            <dt>{dt}</dt>
            <dd>{dd}</dd>
          </dl>
        ))}
      </div>

      {premiumPoints.length > 0 && (
        <div className="strong-points">
          <h3>Points forts</h3>
          {premiumPoints.map((p, i) => (
            <div className="strong-point" key={i}>
              <div className="strong-point-bullet" />
              <div className="strong-point-text">
                <span className="strong-point-label">{p.label}</span>
                {p.rationale ? ` — ${p.rationale}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MarcheSheet({ estimation }: { estimation: Estimation }): React.JSX.Element {
  const { market } = estimation;
  if (!market) return <></>;

  const tendanceLabel: Record<MarketAnalysis['tendance'], string> = {
    hausse: 'en hausse',
    stable: 'stable',
    baisse: 'en repli',
  };

  return (
    <section className="sheet">
      <div className="section-head">
        <span className="overline">Marché local</span>
        <h2>Le marché dans votre secteur</h2>
      </div>

      <p className="market-prose">
        Le marché immobilier de {market.zone} présente un prix médian de{' '}
        {formatPpm2(market.prix_median_m2)}, sur la base de{' '}
        {market.nb_transactions_12m} transactions enregistrées sur les 12 derniers mois.
        La tendance est {tendanceLabel[market.tendance]}.
        {market.delai_moyen_vente_jours != null
          ? ` Le délai moyen de vente observé est de ${market.delai_moyen_vente_jours} jours.`
          : ''}
      </p>

      <div className="market-stats">
        <div className="stat">
          <div className="big num">{formatPpm2(market.prix_median_m2)}</div>
          <div className="lbl">Prix médian au m²</div>
        </div>
        <div className="stat">
          <div className="big num">{market.nb_transactions_12m}</div>
          <div className="lbl">Transactions enregistrées — 12 mois</div>
        </div>
        <div className="stat">
          <div className="big">{market.zone}</div>
          <div className="lbl">Zone de référence</div>
        </div>
      </div>

      <p className="market-source">Sources : transactions enregistrées</p>
    </section>
  );
}

function ComparablesSheet({ estimation }: { estimation: Estimation }): React.JSX.Element {
  const { market } = estimation;
  const comparables: DvfComparable[] = market?.dvf_comparables ?? [];
  if (comparables.length === 0) return <></>;

  return (
    <section className="sheet">
      <div className="section-head">
        <span className="overline">Comparables — ventes réelles</span>
        <h2>Transactions enregistrées dans votre secteur</h2>
      </div>

      <div className="table-wrap">
        <table className="num">
          <thead>
            <tr>
              <th>Adresse</th>
              <th className="r">Surface</th>
              <th className="r">Prix</th>
              <th className="r">€&thinsp;/&thinsp;m²</th>
              <th className="r">Date</th>
            </tr>
          </thead>
          <tbody>
            {comparables.map((c: DvfComparable) => (
              <tr key={c.id}>
                <td className="addr">{c.adresse}</td>
                <td className="r muted">{formatM2(c.surface_reelle_bati)}</td>
                <td className="r">{formatEUR(c.valeur_fonciere)}</td>
                <td className="r">{formatPpm2(c.prix_m2)}</td>
                <td className="r muted">{formatDateMutation(c.date_mutation)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AnnoncesSheet({ estimation }: { estimation: Estimation }): React.JSX.Element | null {
  const { market } = estimation;
  const listings: ListingComparable[] = market?.listing_comparables ?? [];

  // Si vide → omettre la section entièrement
  if (listings.length === 0) return null;

  return (
    <section className="sheet">
      <div className="section-head">
        <span className="overline">Annonces en cours</span>
        <h2>Biens actuellement proposés à la vente</h2>
      </div>

      <div className="table-wrap">
        <table className="num">
          <thead>
            <tr>
              <th>Bien</th>
              <th className="r">Surface</th>
              <th className="r">Prix demandé</th>
              <th className="r">€&thinsp;/&thinsp;m²</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l: ListingComparable) => (
              <tr key={l.id}>
                <td className="addr">{l.titre}</td>
                <td className="r muted">{formatM2(l.surface_m2)}</td>
                <td className="r">{formatEUR(l.prix)}</td>
                <td className="r">{formatPpm2(l.prix_m2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AjustementsSheet({ estimation }: { estimation: Estimation }): React.JSX.Element {
  const { valuation } = estimation;
  const adjustments: ValuationAdjustment[] = valuation?.adjustments ?? [];

  return (
    <section className="sheet">
      <div className="section-head">
        <span className="overline">{"Ajustements d'expertise"}</span>
        <h2>{"Éléments d'appréciation et de décote"}</h2>
      </div>

      <div className="adj-list">
        {adjustments.map((a: ValuationAdjustment, i: number) => {
          const sign = a.type === 'premium' ? '+' : '−';
          const pctFormatted = `${sign} ${Math.abs(a.pct * 100).toFixed(1)} %`;
          return (
            <div className="adj-item" key={i}>
              <div className="adj-sign">{sign}</div>
              <div className="adj-body">
                <div className="adj-label">{a.label}</div>
                {a.rationale && (
                  <div className="adj-rationale">{a.rationale}</div>
                )}
              </div>
              <div className="adj-pct">{pctFormatted}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ConclusionSheet({ estimation }: { estimation: Estimation }): React.JSX.Element {
  const { valuation, saleStrategies } = estimation;
  if (!valuation) return <></>;

  const { lowValue, marketValue, highValue, recommendedListingPrice } = valuation;

  const strategies = saleStrategies ?? [];
  const stratA = strategies[0] ?? null;
  const stratB = strategies[1] ?? null;

  return (
    <section className="sheet">
      <div className="section-head">
        <span className="overline">Conclusion</span>
        <h2>Positionnement et stratégie de mise en vente</h2>
      </div>

      <div className="fourchette">
        <div className="fk">
          <div className="lbl">Valeur basse</div>
          <div className="val">{formatEUR(lowValue)}</div>
        </div>
        <div className="fk mid">
          <div className="lbl">Valeur de marché</div>
          <div className="val">{formatEUR(marketValue)}</div>
        </div>
        <div className="fk">
          <div className="lbl">Valeur haute</div>
          <div className="val">{formatEUR(highValue)}</div>
        </div>
      </div>

      <div className="listing-price">
        <div>
          <div className="lp-label">Prix de mise en vente conseillé</div>
          <div className="lp-val">{formatEUR(recommendedListingPrice)}</div>
        </div>
      </div>

      {(stratA || stratB) && (
        <div className="strat-grid">
          {stratA && (
            <div className="strat-col">
              <div className="strat-k">Stratégie — vente rapide</div>
              <div className="strat-d">{stratA}</div>
            </div>
          )}
          {stratB && (
            <div className="strat-col">
              <div className="strat-k">Stratégie — valorisation</div>
              <div className="strat-d">{stratB}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ReservesSheet({ estimation }: { estimation: Estimation }): React.JSX.Element | null {
  const fields = getToConfirmFields(estimation);
  // Si aucun champ à confirmer, omettre la section
  if (fields.length === 0) return null;

  return (
    <section className="sheet">
      {/* §9 Réserves — données à confirmer. Volontairement exclu du firewall de contenu. */}
      <div className="reserves-section">
        <div className="res-title">Annexe — Données à confirmer</div>
        {fields.map(({ field, label }) => (
          <div className="reserve-item" key={field}>
            <div className="reserve-field">{label}</div>
            <div className="reserve-note">Information à vérifier avant finalisation</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Composant principal ──────────────────────────────────────────────────────

export function Brochure({ estimation }: { estimation: Estimation }): React.JSX.Element {
  const { market } = estimation;
  // Correction : les champs snake_case du type MarketAnalysis
  const dvfCount = market?.dvf_comparables?.length ?? 0;
  const listingCount = market?.listing_comparables?.length ?? 0;

  return (
    <>
      {/* §1 Couverture */}
      <CoverSheet estimation={estimation} />

      {/* §2 Synthèse — hero valeur */}
      {estimation.valuation && <SyntheseSheet estimation={estimation} />}

      {/* §3 Présentation du bien */}
      <PresentationSheet estimation={estimation} />

      {/* §4 Marché local */}
      {estimation.market && <MarcheSheet estimation={estimation} />}

      {/* §5 Comparables DVF */}
      {dvfCount > 0 && <ComparablesSheet estimation={estimation} />}

      {/* §6 Annonces en cours — omise si vide */}
      {listingCount > 0 && <AnnoncesSheet estimation={estimation} />}

      {/* §7 Ajustements */}
      {(estimation.valuation?.adjustments?.length ?? 0) > 0 && (
        <AjustementsSheet estimation={estimation} />
      )}

      {/* §8 Conclusion */}
      {estimation.valuation && <ConclusionSheet estimation={estimation} />}

      {/* §9 Réserves — annexe discrète, données à confirmer */}
      <ReservesSheet estimation={estimation} />
    </>
  );
}
