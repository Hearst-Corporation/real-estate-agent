"use client";

/**
 * CreateDealWizard — formulaire de création d'un deal (client component).
 *
 * POSTe vers /api/invest/deals (garde opérateur/admin côté serveur). Garde-fous
 * de saisie (étude P7 / blueprint) matérialisés ici :
 *   - SCÉNARIO PESSIMISTE calculé EN DIRECT par le moteur (buildDealSheet) et
 *     affiché AVANT publication (l'opérateur voit le pire cas + warnings).
 *   - Suffixe "non garanti" FORCÉ sur tout affichage de rendement (cible).
 *   - SÉQUESTRE TIERS obligatoire (case à cocher requise avant soumission).
 *   - settlement_currency ∈ {EUR, EURC, EURe} (jamais USDT — select fermé).
 *   - token_standard ∈ {ERC-3643, ERC-1400} (jamais ERC-20/4626 — select fermé).
 *
 * Le moteur financier est PUR → on l'exécute côté client pour la prévisualisation,
 * sans aucun appel réseau.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildDealSheet,
  type DealInput,
  type OperationType,
} from "@/lib/invest/finance";
import {
  DEAL_DEFAULTS,
  PLATFORM_FEES,
  SCENARIO_DEFAULTS,
  LOCATIF_YIELD_PCT,
} from "@/lib/invest/constants";

type DealTypeDb = "marchand_de_biens" | "promotion" | "locatif" | "value_add" | "mixte";
type SettlementCurrency = "EUR" | "EURC" | "EURe";
type TokenStandard = "ERC-3643" | "ERC-1400";

/** Mappe le type DB (5) vers OperationType moteur (3) — cohérent avec le service. */
function toOperationType(t: DealTypeDb): OperationType {
  if (t === "locatif") return "locatif";
  if (t === "promotion") return "promotion";
  return "marchand_de_biens";
}

const fmtEur = (n: number) =>
  `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
const fmtPct = (p: number | null) =>
  p == null || Number.isNaN(p) ? "—" : `${(p * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

function Field({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <label className="inv-field">
      <span className="ct-kpi-label">{label}</span>
      <span className="inv-field-row">
        <input
          className="ct-input inv-w-full"
          type="number"
          value={value}
          min={0}
          onChange={(ev) => onChange(Number(ev.target.value))}
        />
        {suffix ? <span className="inv-chart-foot">{suffix}</span> : null}
      </span>
    </label>
  );
}

export function CreateDealWizard() {
  const router = useRouter();

  // ─── Champs du formulaire (euros, %) ──
  const [legalName, setLegalName] = useState("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [dealType, setDealType] = useState<DealTypeDb>("marchand_de_biens");
  const [city, setCity] = useState("");

  const [acquisition, setAcquisition] = useState<number>(DEAL_DEFAULTS.acquisition);
  const [notary, setNotary] = useState<number>(DEAL_DEFAULTS.notary);
  const [works, setWorks] = useState<number>(DEAL_DEFAULTS.works);
  const [other, setOther] = useState<number>(DEAL_DEFAULTS.other);
  const [seniorDebt, setSeniorDebt] = useState<number>(DEAL_DEFAULTS.seniorDebt);
  const [seniorRatePct, setSeniorRatePct] = useState<number>(DEAL_DEFAULTS.seniorRatePct);
  const [sponsorEquity, setSponsorEquity] = useState<number>(DEAL_DEFAULTS.sponsorEquity);
  const [targetRaise, setTargetRaise] = useState<number>(DEAL_DEFAULTS.targetRaise);
  const [couponPct, setCouponPct] = useState<number>(DEAL_DEFAULTS.couponPct);
  const [durationMonths, setDurationMonths] = useState<number>(DEAL_DEFAULTS.durationMonths);
  const [appraised, setAppraised] = useState<number>(DEAL_DEFAULTS.appraised);
  const [resalePrice, setResalePrice] = useState<number>(DEAL_DEFAULTS.resalePrice);
  const [minTicket, setMinTicket] = useState<number>(DEAL_DEFAULTS.minTicket);

  const [settlement, setSettlement] = useState<SettlementCurrency>("EUR");
  const [tokenStandard, setTokenStandard] = useState<TokenStandard>("ERC-3643");

  // Garde-fou : séquestre tiers obligatoire (ne PAS soumettre sans la coche).
  const [escrowAck, setEscrowAck] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Prévisualisation moteur (PUR, en direct) ──
  const preview = useMemo(() => {
    const totalCost = acquisition + notary + works + other;
    const input: DealInput = {
      id: slug || "preview",
      nom: name || "Nouveau deal",
      localisation: city || "Localisation au closing/NDA",
      type_operation: toOperationType(dealType),
      costs: {
        prix_acquisition_eur: acquisition,
        frais_notaire_eur: notary,
        budget_travaux_eur: works,
        frais_divers_portage_eur: other,
      },
      funding: {
        dette_senior_eur: seniorDebt,
        taux_dette_senior_annuel: seniorRatePct / 100,
        equity_sponsor_eur: sponsorEquity,
        obligations_cible_eur: targetRaise,
        taux_coupon_obligataire_annuel: couponPct / 100,
      },
      fees: {
        frais_plateforme_entree_pct: PLATFORM_FEES.entryPct,
        frais_plateforme_admin_annuel_pct: PLATFORM_FEES.adminAnnuelPct,
        frais_operateur_acquisition_pct: PLATFORM_FEES.operateurAcqPct,
        carried_operateur_pct: PLATFORM_FEES.carriedPct,
        hurdle_annuel: PLATFORM_FEES.hurdleAnnuel,
      },
      schedule: { duree_mois: durationMonths, date_closing: new Date().toISOString().slice(0, 10) },
      exit: {
        prix_revente_central_eur: resalePrice,
        valeur_expertise_eur: appraised,
        ...(dealType === "locatif" ? { loyer_net_annuel_eur: Math.round(targetRaise * LOCATIF_YIELD_PCT) } : {}),
      },
      scenarios: {
        pessimiste: { delta_prix_revente_pct: SCENARIO_DEFAULTS.pessimiste.deltaPrixPct, retard_mois: SCENARIO_DEFAULTS.pessimiste.retardMois },
        central: { delta_prix_revente_pct: SCENARIO_DEFAULTS.central.deltaPrixPct, retard_mois: SCENARIO_DEFAULTS.central.retardMois },
        optimiste: { delta_prix_revente_pct: SCENARIO_DEFAULTS.optimiste.deltaPrixPct, retard_mois: SCENARIO_DEFAULTS.optimiste.retardMois },
      },
      ticket_min_eur: minTicket,
      day_count: "ACT_365",
    };
    try {
      const sheet = buildDealSheet(input);
      return { sheet, totalCost, ok: true as const };
    } catch {
      return { sheet: null, totalCost, ok: false as const };
    }
  }, [
    slug, name, city, dealType, acquisition, notary, works, other, seniorDebt, seniorRatePct,
    sponsorEquity, targetRaise, couponPct, durationMonths, appraised, resalePrice, minTicket,
  ]);

  const pess = preview.sheet?.scenarios.pessimiste ?? null;
  const central = preview.sheet?.scenarios.central ?? null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!escrowAck) {
      setError("Le séquestre tiers est obligatoire : cochez l'engagement avant de créer le deal.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/invest/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spv: { legalName, legalForm: "SAS", assetCity: city || null, seniorDebtAmountEur: seniorDebt },
          deal: {
            slug,
            name,
            dealType,
            city: city || null,
            acquisitionPriceEur: acquisition,
            notaryFeesEur: notary,
            worksBudgetEur: works,
            otherCostsEur: other,
            seniorDebtEur: seniorDebt,
            sponsorEquityEur: sponsorEquity,
            appraisedValueEur: appraised,
            targetRaiseEur: targetRaise,
            minTicketEur: minTicket,
            durationMonths,
            settlementCurrency: settlement,
            seniorRateAnnual: seniorRatePct / 100,
            prixReventeCentralEur: resalePrice,
          },
          tranche: {
            name: `Obligations ${new Date().getFullYear()}-A`,
            seniority: "senior_secured",
            couponRatePct: couponPct,
            tokenStandard,
            nominalUnitEur: DEAL_DEFAULTS.nominalUnitEur,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.detail ? `${json.error} — ${JSON.stringify(json.detail)}` : json?.error ?? "Échec de la création");
        setSubmitting(false);
        return;
      }
      // Succès → retour à la liste opérateur.
      router.push("/invest/operateur");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="inv-grid-2 loose">
        {/* Colonne saisie */}
        <div className="inv-chart-card">
          <div className="inv-chart-head">
            <span className="inv-chart-title">Identité & économie de l’opération</span>
          </div>

          <div className="inv-grid-form">
            <label className="inv-field" >
              <span className="ct-kpi-label">SAS émettrice (raison sociale)</span>
              <input className="ct-input" value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
            </label>
            <label className="inv-field" >
              <span className="ct-kpi-label">Nom commercial du deal</span>
              <input className="ct-input" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="inv-field" >
              <span className="ct-kpi-label">Slug (URL)</span>
              <input
                className="ct-input"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="residence-xyz-lyon6"
                required
              />
            </label>
            <label className="inv-field" >
              <span className="ct-kpi-label">Ville</span>
              <input className="ct-input" value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="inv-field" >
              <span className="ct-kpi-label">Type d’opération</span>
              <select className="ct-input" value={dealType} onChange={(e) => setDealType(e.target.value as DealTypeDb)}>
                <option value="marchand_de_biens">Marchand de biens</option>
                <option value="promotion">Promotion</option>
                <option value="locatif">Locatif</option>
                <option value="value_add">Value-add</option>
                <option value="mixte">Mixte</option>
              </select>
            </label>
            <Field label="Durée cible" value={durationMonths} onChange={setDurationMonths} suffix="mois" />
          </div>

          <div className="inv-chart-head inv-chart-head-mt">
            <span className="inv-chart-title">Postes de coût</span>
          </div>
          <div className="inv-grid-form">
            <Field label="Prix d’acquisition" value={acquisition} onChange={setAcquisition} suffix="€" />
            <Field label="Frais de notaire" value={notary} onChange={setNotary} suffix="€" />
            <Field label="Budget travaux" value={works} onChange={setWorks} suffix="€" />
            <Field label="Frais divers / portage" value={other} onChange={setOther} suffix="€" />
          </div>

          <div className="inv-chart-head inv-chart-head-mt">
            <span className="inv-chart-title">Financement</span>
          </div>
          <div className="inv-grid-form">
            <Field label="Dette senior" value={seniorDebt} onChange={setSeniorDebt} suffix="€" />
            <Field label="Taux dette senior" value={seniorRatePct} onChange={setSeniorRatePct} suffix="%/an" />
            <Field label="Equity sponsor" value={sponsorEquity} onChange={setSponsorEquity} suffix="€" />
            <Field label="Obligations (objectif de levée)" value={targetRaise} onChange={setTargetRaise} suffix="€" />
            <Field label="Coupon cible (non garanti)" value={couponPct} onChange={setCouponPct} suffix="%/an · non gar." />
            <Field label="Ticket minimum" value={minTicket} onChange={setMinTicket} suffix="€" />
          </div>

          <div className="inv-chart-head inv-chart-head-mt">
            <span className="inv-chart-title">Sortie & valorisation</span>
          </div>
          <div className="inv-grid-form">
            <Field label="Prix de revente central" value={resalePrice} onChange={setResalePrice} suffix="€" />
            <Field label="Valeur d’expertise (base LTV)" value={appraised} onChange={setAppraised} suffix="€" />
          </div>

          <div className="inv-chart-head inv-chart-head-mt">
            <span className="inv-chart-title">Règlement & token (cadre anti-FIA)</span>
          </div>
          <div className="inv-grid-form">
            <label className="inv-field" >
              <span className="ct-kpi-label">Devise de règlement</span>
              <select className="ct-input" value={settlement} onChange={(e) => setSettlement(e.target.value as SettlementCurrency)}>
                <option value="EUR">EUR (séquestre)</option>
                <option value="EURC">EURC (stablecoin régulé)</option>
                <option value="EURe">EURe (stablecoin régulé)</option>
              </select>
            </label>
            <label className="inv-field" >
              <span className="ct-kpi-label">Standard du token</span>
              <select className="ct-input" value={tokenStandard} onChange={(e) => setTokenStandard(e.target.value as TokenStandard)}>
                <option value="ERC-3643">ERC-3643 (T-REX permissionné)</option>
                <option value="ERC-1400">ERC-1400 (security token)</option>
              </select>
            </label>
          </div>
        </div>

        {/* Colonne prévisualisation moteur (pessimiste avant publication) */}
        <div className="inv-chart-card inv-chart-self-start">
          <div className="inv-chart-head">
            <span className="inv-chart-title">Prévisualisation moteur (avant publication)</span>
          </div>

          <dl className="inv-dl">
            <dt>Coût total projet</dt>
            <dd>{fmtEur(preview.totalCost)}</dd>
            <dt>LTV (dette / valeur)</dt>
            <dd>{fmtPct(preview.sheet?.metrics.ltv ?? null)}</dd>
            <dt>Marge marchand</dt>
            <dd>{fmtPct(preview.sheet?.metrics.marge_marchand_pct ?? null)}</dd>
            <dt>TRI cible · scénario central · non garanti</dt>
            <dd>{fmtPct(central?.irr_investisseur.irr ?? null)}</dd>
          </dl>

          <div className="inv-chart-head inv-chart-head-mt-sm">
            <span className="inv-chart-title">Scénario PESSIMISTE (pire cas)</span>
          </div>
          {pess ? (
            <dl className="inv-dl">
              <dt>TRI pessimiste · non garanti</dt>
              <dd>{fmtPct(pess.irr_investisseur.irr)}</dd>
              <dt>Capital obligataire remboursé</dt>
              <dd>{fmtEur(pess.waterfall.obligataire.principal_rembourse_eur)}</dd>
              <dt>Perte en capital (pessimiste)</dt>
              <dd>{fmtEur(pess.waterfall.obligataire.perte_capital_eur)}</dd>
            </dl>
          ) : (
            <p className="inv-chart-foot">Renseignez les montants pour calculer le pire cas.</p>
          )}

          {preview.sheet && preview.sheet.warnings.length > 0 ? (
            <div className="inv-banner inv-banner-warn inv-banner-compact">
              <b>Points d’attention du moteur :</b>
              <ul className="inv-list-ul">
                {preview.sheet.warnings.map((w, i) => (
                  <li key={i} className="inv-chart-foot">{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <label className="inv-check-row">
            <input type="checkbox" checked={escrowAck} onChange={(e) => setEscrowAck(e.target.checked)} />
            <span className="inv-chart-foot">
              Je confirme que les versements transiteront par un <b>séquestre tiers</b> (notaire ou EMI
              régulée), jamais par la plateforme. Tout rendement affiché est une <b>cible non garantie</b> ;
              les investisseurs sont créanciers obligataires et encourent un risque de perte en capital.
            </span>
          </label>

          {error ? (
            <p className="inv-chart-foot inv-error-note">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className={`inv-btn-reserve inv-submit-btn${submitting || !escrowAck ? " is-disabled" : ""}`}
            disabled={submitting || !escrowAck}
          >
            {submitting ? "Création…" : "Créer le deal (brouillon)"}
          </button>
          <p className="inv-reserve-note">
            Le deal naît en brouillon. La publication (mise en marché) exigera un KIIS publié.
          </p>
        </div>
      </div>
    </form>
  );
}
