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

import { useMemo, useState, type ReactNode } from "react";
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
import { UI } from "@/lib/ui-strings";
import { Card } from "@/components/cockpit/primitives";
import { Banner } from "@/components/invest";
import { Button } from "@/components/ui/button";
import { Field as CatField, Label } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { Description } from "@/components/ui/fieldset";

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

/** Titre de sous-section interne au wizard (remplace l'ancien `.inv-chart-head`/`.inv-chart-title`). */
function WizardSectionTitle({
  children,
  first,
  compact,
}: {
  children: ReactNode;
  /** Pas de marge haute (première section d'une carte). */
  first?: boolean;
  /** Marge haute réduite (sous-section dans la colonne preview). */
  compact?: boolean;
}) {
  return (
    <div className={`${first ? "" : compact ? "mt-4" : "mt-6"} mb-3 border-b border-white/10 pb-2`}>
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{children}</span>
    </div>
  );
}

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
    <CatField>
      <Label>{label}</Label>
      <span className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          min={0}
          onChange={(ev) => onChange(Number(ev.target.value))}
        />
        {suffix ? <span className="shrink-0 text-xs text-slate-500">{suffix}</span> : null}
      </span>
    </CatField>
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
      setError(UI.invest.operator.wizard.escrowError);
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
        setError(json?.detail ? `${json.error} — ${JSON.stringify(json.detail)}` : json?.error ?? UI.invest.operator.wizard.submitFallbackError);
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
      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2 @4xl:items-start">
        {/* Colonne saisie */}
        <Card>
          <WizardSectionTitle first>{UI.invest.operator.wizard.sectionIdentity}</WizardSectionTitle>

          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
            <CatField>
              <Label>{UI.invest.operator.wizard.legalName}</Label>
              <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
            </CatField>
            <CatField>
              <Label>{UI.invest.operator.wizard.name}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </CatField>
            <CatField>
              <Label>{UI.invest.operator.wizard.slug}</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder={UI.invest.operator.wizard.slugPlaceholder}
                required
              />
            </CatField>
            <CatField>
              <Label>{UI.invest.operator.wizard.city}</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </CatField>
            <CatField>
              <Label>{UI.invest.operator.wizard.dealType}</Label>
              <Select value={dealType} onChange={(e) => setDealType(e.target.value as DealTypeDb)}>
                <option value="marchand_de_biens">{UI.invest.dealDetail.typeLabels.marchand_de_biens}</option>
                <option value="promotion">{UI.invest.dealDetail.typeLabels.promotion}</option>
                <option value="locatif">{UI.invest.dealDetail.typeLabels.locatif}</option>
                <option value="value_add">{UI.invest.dealDetail.typeLabels.value_add}</option>
                <option value="mixte">{UI.invest.dealDetail.typeLabels.mixte}</option>
              </Select>
            </CatField>
            <Field label={UI.invest.operator.wizard.durationLabel} value={durationMonths} onChange={setDurationMonths} suffix={UI.invest.operator.wizard.durationSuffix} />
          </div>

          <WizardSectionTitle>{UI.invest.operator.wizard.sectionCosts}</WizardSectionTitle>
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
            <Field label={UI.invest.operator.wizard.acquisition} value={acquisition} onChange={setAcquisition} suffix={UI.invest.operator.wizard.eurSuffix} />
            <Field label={UI.invest.operator.wizard.notary} value={notary} onChange={setNotary} suffix={UI.invest.operator.wizard.eurSuffix} />
            <Field label={UI.invest.operator.wizard.works} value={works} onChange={setWorks} suffix={UI.invest.operator.wizard.eurSuffix} />
            <Field label={UI.invest.operator.wizard.other} value={other} onChange={setOther} suffix={UI.invest.operator.wizard.eurSuffix} />
          </div>

          <WizardSectionTitle>{UI.invest.operator.wizard.sectionFunding}</WizardSectionTitle>
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
            <Field label={UI.invest.operator.wizard.seniorDebt} value={seniorDebt} onChange={setSeniorDebt} suffix={UI.invest.operator.wizard.eurSuffix} />
            <Field label={UI.invest.operator.wizard.seniorRate} value={seniorRatePct} onChange={setSeniorRatePct} suffix={UI.invest.operator.wizard.seniorRateSuffix} />
            <Field label={UI.invest.operator.wizard.sponsorEquity} value={sponsorEquity} onChange={setSponsorEquity} suffix={UI.invest.operator.wizard.eurSuffix} />
            <Field label={UI.invest.operator.wizard.targetRaise} value={targetRaise} onChange={setTargetRaise} suffix={UI.invest.operator.wizard.eurSuffix} />
            <Field label={UI.invest.operator.wizard.coupon} value={couponPct} onChange={setCouponPct} suffix={UI.invest.operator.wizard.couponSuffix} />
            <Field label={UI.invest.operator.wizard.minTicket} value={minTicket} onChange={setMinTicket} suffix={UI.invest.operator.wizard.eurSuffix} />
          </div>

          <WizardSectionTitle>{UI.invest.operator.wizard.sectionExit}</WizardSectionTitle>
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
            <Field label={UI.invest.operator.wizard.resalePrice} value={resalePrice} onChange={setResalePrice} suffix={UI.invest.operator.wizard.eurSuffix} />
            <Field label={UI.invest.operator.wizard.appraised} value={appraised} onChange={setAppraised} suffix={UI.invest.operator.wizard.eurSuffix} />
          </div>

          <WizardSectionTitle>{UI.invest.operator.wizard.sectionSettlement}</WizardSectionTitle>
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
            <CatField>
              <Label>{UI.invest.operator.wizard.settlementCurrency}</Label>
              <Select value={settlement} onChange={(e) => setSettlement(e.target.value as SettlementCurrency)}>
                <option value="EUR">{UI.invest.operator.wizard.settlementEur}</option>
                <option value="EURC">{UI.invest.operator.wizard.settlementEurc}</option>
                <option value="EURe">{UI.invest.operator.wizard.settlementEure}</option>
              </Select>
            </CatField>
            <CatField>
              <Label>{UI.invest.operator.wizard.tokenStandard}</Label>
              <Select value={tokenStandard} onChange={(e) => setTokenStandard(e.target.value as TokenStandard)}>
                <option value="ERC-3643">{UI.invest.operator.wizard.tokenStandardErc3643}</option>
                <option value="ERC-1400">{UI.invest.operator.wizard.tokenStandardErc1400}</option>
              </Select>
            </CatField>
          </div>
        </Card>

        {/* Colonne prévisualisation moteur (pessimiste avant publication) */}
        <Card className="@4xl:sticky @4xl:top-4">
          <WizardSectionTitle first>{UI.invest.operator.wizard.previewTitle}</WizardSectionTitle>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt className="text-slate-500">{UI.invest.operator.wizard.previewTotalCost}</dt>
            <dd className="text-right font-medium text-slate-100">{fmtEur(preview.totalCost)}</dd>
            <dt className="text-slate-500">{UI.invest.operator.wizard.previewLtv}</dt>
            <dd className="text-right font-medium text-slate-100">{fmtPct(preview.sheet?.metrics.ltv ?? null)}</dd>
            <dt className="text-slate-500">{UI.invest.operator.wizard.previewMargin}</dt>
            <dd className="text-right font-medium text-slate-100">{fmtPct(preview.sheet?.metrics.marge_marchand_pct ?? null)}</dd>
            <dt className="text-slate-500">{UI.invest.operator.wizard.previewTriCentral}</dt>
            <dd className="text-right font-medium text-slate-100">{fmtPct(central?.irr_investisseur.irr ?? null)}</dd>
          </dl>

          <WizardSectionTitle compact>{UI.invest.operator.wizard.scenarioPessTitle}</WizardSectionTitle>
          {pess ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-slate-500">{UI.invest.operator.wizard.scenarioPessTri}</dt>
              <dd className="text-right font-medium text-slate-100">{fmtPct(pess.irr_investisseur.irr)}</dd>
              <dt className="text-slate-500">{UI.invest.operator.wizard.scenarioPessPrincipal}</dt>
              <dd className="text-right font-medium text-slate-100">{fmtEur(pess.waterfall.obligataire.principal_rembourse_eur)}</dd>
              <dt className="text-slate-500">{UI.invest.operator.wizard.scenarioPessLoss}</dt>
              <dd className="text-right font-medium text-slate-100">{fmtEur(pess.waterfall.obligataire.perte_capital_eur)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">{UI.invest.operator.wizard.previewEmpty}</p>
          )}

          {preview.sheet && preview.sheet.warnings.length > 0 ? (
            <div className="mt-4">
              <Banner tone="warn">
                <b>{UI.invest.operator.wizard.warningsTitle}</b>
                <ul className="mt-1.5 list-inside list-disc space-y-0.5">
                  {preview.sheet.warnings.map((w, i) => (
                    <li key={i} className="text-xs">{w}</li>
                  ))}
                </ul>
              </Banner>
            </div>
          ) : null}

          <CheckboxField className="mt-4">
            <Checkbox
              checked={escrowAck}
              onChange={setEscrowAck}
              color="indigo"
            />
            <Description className="text-xs text-slate-400">
              {UI.invest.operator.wizard.escrowAckPart1}
              <b className="text-slate-200">{UI.invest.operator.wizard.escrowAckBold1}</b>
              {UI.invest.operator.wizard.escrowAckPart2}
              <b className="text-slate-200">{UI.invest.operator.wizard.escrowAckBold2}</b>
              {UI.invest.operator.wizard.escrowAckPart3}
            </Description>
          </CheckboxField>

          {error ? <p className="mt-3 text-xs text-slate-400">{error}</p> : null}

          <Button
            type="submit"
            className="mt-4 w-full"
            color="indigo"
            disabled={submitting || !escrowAck}
          >
            {submitting ? UI.invest.operator.wizard.submitBusy : UI.invest.operator.wizard.submit}
          </Button>
          <p className="mt-2 text-center text-xs text-slate-500">
            {UI.invest.operator.wizard.submitNote}
          </p>
        </Card>
      </div>
    </form>
  );
}
