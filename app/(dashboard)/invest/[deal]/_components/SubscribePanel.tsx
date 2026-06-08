"use client";

/**
 * SubscribePanel — bloc de SOUSCRIPTION de la fiche deal (Epic 1.3, P5/P10).
 *
 * Stepper en 4 étapes, piloté côté serveur (aucune transition de statut côté client) :
 *   1. Montant       — ticket ∈ [min, max], validation locale + serveur.
 *   2. Réserver      — « Réserver ma place » = soft-commit NON ENGAGEANT, sans
 *                      versement, révocable (POST /deals/{id}/subscribe → reserved).
 *   3. Signature     — signature eIDAS du bulletin (POST /subscriptions/{id}/sign).
 *                      Le passage en « signé » est confirmé par le prestataire.
 *   4. Versement     — vers un SÉQUESTRE TIERS (POST /subscriptions/{id}/fund),
 *                      schéma « Vous → Séquestre tiers → SPV », délai 4 jours, EUR
 *                      par défaut. La plateforme ne reçoit jamais les fonds.
 *
 * Si l'identité n'est pas vérifiée (KYC) → Gate + CTA vers /invest/onboarding.
 * États vide / chargement / erreur / succès gérés. Réutilise les primitives
 * components/invest (Stepper, Banner, Gate, StatusPill, Toast) + classes --ct-*.
 *
 * Anti-FIA (lint:legal) : « réservation non engageante · sans versement ·
 * révocable » ; séquestre tiers nommé (jamais un compte plateforme) ; vous êtes
 * créancier ; tout rendement est une cible non garantie ; risque de perte en capital.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Stepper, Banner, Gate, StatusPill, Toast, eur } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { TICKET_STEP } from "@/lib/invest/constants";

const t = UI.invest.subscribe;

/** Statuts de souscription exposés à l'UI (miroir machine serveur). */
type SubStatus =
  | "reserved"
  | "signed"
  | "funded"
  | "allocated"
  | "minted"
  | "refunded"
  | "cancelled"
  | "withdrawn";

interface SubscriptionView {
  id: string;
  status: SubStatus;
  amountEur: number;
  units: number;
  settlementCurrency: string;
  coolingOffEndsAt: string | null;
  withinCoolingOff: boolean;
}

export interface SubscribePanelProps {
  dealId: string;
  dealName: string;
  /** true = deal ouvert à la souscription. */
  dealOpen: boolean;
  ticketMinEur: number;
  ticketMaxEur: number;
  /** Devise de règlement par défaut (EUR). */
  settlementCurrency: string;
  /** Nom du séquestre tiers (notaire / EMI régulée). */
  sequestreLabel: string;
  /** Identité vérifiée (KYC approuvé) → souscription possible, sinon Gate. */
  kycApproved: boolean;
  /** Nom de la SPV émettrice (schéma de flux des fonds). */
  spvLabel: string;
}

const STEPS = [...t.steps];

/** Étape courante dérivée du statut de la souscription (ou 0 si pas encore créée). */
function stepFromStatus(sub: SubscriptionView | null): number {
  if (!sub) return 0;
  switch (sub.status) {
    case "reserved":
      return 2; // réservé → étape signature
    case "signed":
      return 3; // signé → étape versement
    case "funded":
    case "allocated":
    case "minted":
      return 3;
    default:
      return 0; // sorties (cancelled/withdrawn/refunded) → on peut recommencer
  }
}

const STATUS_TONE: Record<SubStatus, "open" | "soon" | "funded" | "closed" | "neutral"> = {
  reserved: "soon",
  signed: "soon",
  funded: "open",
  allocated: "open",
  minted: "funded",
  refunded: "neutral",
  cancelled: "neutral",
  withdrawn: "neutral",
};

export function SubscribePanel(props: SubscribePanelProps) {
  const { dealId, ticketMinEur, ticketMaxEur, settlementCurrency, sequestreLabel, kycApproved, spvLabel } =
    props;

  const [amount, setAmount] = useState<string>(String(ticketMinEur));
  const [sub, setSub] = useState<SubscriptionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const amountNum = Number(amount);
  const amountValid =
    Number.isFinite(amountNum) && amountNum >= ticketMinEur && amountNum <= ticketMaxEur;

  const step = useMemo(() => stepFromStatus(sub), [sub]);

  // ── Mappe un code d'erreur conformité serveur → message FR lisible. ──
  const reasonToMessage = useCallback(
    (reason: string): string => {
      if (reason.startsWith("deal_not_open")) return t.errors.dealClosed;
      if (reason === "kyc_not_approved") return t.errors.kyc;
      if (reason === "suitability_required") return t.errors.suitability;
      if (reason.startsWith("ticket_below_min")) return t.errors.ticketMin(eur(ticketMinEur));
      if (reason.startsWith("ticket_above_max")) return t.errors.ticketMax(eur(ticketMaxEur));
      if (reason.startsWith("annual_cap_exceeded")) {
        const m = /remaining=([\d.]+)/.exec(reason);
        const remaining = m ? Number(m[1]) : null;
        return remaining != null
          ? t.errors.annualCap(eur(remaining))
          : t.errors.annualCapGeneric;
      }
      if (reason === "cooling_off_expired") return t.errors.coolingOff;
      return reason;
    },
    [ticketMinEur, ticketMaxEur],
  );

  /** Lit une réponse d'API et lève un message FR si non-ok. */
  const handleResponse = useCallback(
    async (res: Response): Promise<Record<string, unknown>> => {
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) return json;
      if (res.status === 502) {
        const err = String(json.error ?? "");
        throw new Error(
          err === "esign_not_configured"
            ? t.errors.esignUnavailable
            : err === "escrow_not_configured"
              ? t.errors.escrowUnavailable
              : t.errors.serviceUnavailable,
        );
      }
      if (res.status === 422 && json.reason) throw new Error(reasonToMessage(String(json.reason)));
      throw new Error(String(json.error ?? t.errors.generic));
    },
    [reasonToMessage],
  );

  // ── Étape 2 — Réserver ma place (soft-commit non engageant) ──
  const reserve = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/invest/deals/${dealId}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountEur: amountNum }),
      });
      const json = await handleResponse(res);
      setSub(json.subscription as SubscriptionView);
      setNotice(t.notices.reserved);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.reserve);
    } finally {
      setBusy(false);
    }
  }, [dealId, amountNum, handleResponse]);

  // ── Étape 3 — Signature eIDAS ──
  const sign = useCallback(async () => {
    if (!sub) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/invest/subscriptions/${sub.id}/sign`, { method: "POST" });
      const json = await handleResponse(res);
      const sig = json.signature as { signUrl?: string } | undefined;
      if (sig?.signUrl) {
        setNotice(t.notices.signUrl);
        window.open(sig.signUrl, "_blank", "noopener");
      } else {
        setNotice(t.notices.signEmail);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.sign);
    } finally {
      setBusy(false);
    }
  }, [sub, handleResponse]);

  // ── Étape 4 — Versement vers le séquestre tiers ──
  const fund = useCallback(async () => {
    if (!sub) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/invest/subscriptions/${sub.id}/fund`, { method: "POST" });
      const json = await handleResponse(res);
      const funding = json.funding as { coolingOffEndsAt?: string } | undefined;
      setNotice(t.notices.funded);
      if (funding?.coolingOffEndsAt && sub) {
        setSub({ ...sub, coolingOffEndsAt: funding.coolingOffEndsAt, withinCoolingOff: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.fund);
    } finally {
      setBusy(false);
    }
  }, [sub, handleResponse]);

  // ── Annulation / rétractation (pendant le délai 4j) ──
  const cancel = useCallback(async () => {
    if (!sub) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/invest/subscriptions/${sub.id}/cancel`, { method: "POST" });
      const json = await handleResponse(res);
      setSub(json.subscription as SubscriptionView);
      setNotice(t.notices.cancelled);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.cancel);
    } finally {
      setBusy(false);
    }
  }, [sub, handleResponse]);

  // ── GATE : identité non vérifiée → CTA onboarding ──
  if (!kycApproved) {
    return (
      <div className="inv-raise-box">
        <Gate
          locked
          message={t.kycGateMessage}
          cta={
            <Link
              href="/invest/onboarding"
              className="inv-btn-reserve inv-link-inline"
            >
              {t.kycCta}
            </Link>
          }
        >
          <div className="inv-sub-spacer" />
        </Gate>
        <p className="inv-reserve-note">{t.creditorNote}</p>
      </div>
    );
  }

  const flux = (
    <div className="inv-flow" aria-label={t.flowAria}>
      <span className="inv-flow-node">{t.flowYou}</span>
      <span className="inv-flow-arrow" aria-hidden>→</span>
      <span className="inv-flow-node inv-flow-node-accent">{t.flowEscrow}</span>
      <span className="inv-flow-arrow" aria-hidden>→</span>
      <span className="inv-flow-node">{spvLabel || t.flowSpvFallback}</span>
    </div>
  );

  return (
    <div className="inv-raise-box" id="subscribe">
      <Stepper steps={STEPS} current={step} />

      {sub ? (
        <div className="inv-row-between is-center">
          <StatusPill tone={STATUS_TONE[sub.status]}>{t.status[sub.status]}</StatusPill>
          <span className="inv-raise-stat inv-raise-stat-row">
            <span className="inv-v">{eur(sub.amountEur)}</span>
            <span className="inv-l">{sub.settlementCurrency}</span>
          </span>
        </div>
      ) : null}

      {error ? <Toast tone="error">{error}</Toast> : null}
      {notice ? <Toast tone="success">{notice}</Toast> : null}

      {/* ── Étape 1 — Montant (avant toute réservation) ── */}
      {step === 0 ? (
        <>
          <label className="inv-sub-label" htmlFor="sub-amount">
            {t.amountLabel}
          </label>
          <div className="inv-sub-amount-row">
            <input
              id="sub-amount"
              className="ct-input"
              type="number"
              inputMode="numeric"
              min={ticketMinEur}
              max={ticketMaxEur}
              step={TICKET_STEP}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-describedby="sub-amount-hint"
            />
            <span className="inv-sub-currency">{settlementCurrency}</span>
          </div>
          <p id="sub-amount-hint" className="inv-reserve-note inv-reserve-left">
            {t.amountHint(eur(ticketMinEur), eur(ticketMaxEur), settlementCurrency)}
          </p>
          {!amountValid && amount !== "" ? (
            <Banner tone="warn">
              {t.amountInvalid(eur(ticketMinEur), eur(ticketMaxEur))}
            </Banner>
          ) : null}
          <button
            className="inv-btn-reserve"
            type="button"
            disabled={!amountValid || busy || !props.dealOpen}
            onClick={reserve}
          >
            {busy ? t.reserveBusy : t.reserveBtn}
          </button>
          <p className="inv-reserve-note">{t.reserveNote}</p>
        </>
      ) : null}

      {/* ── Étape 2 (réservé) — Signature eIDAS ── */}
      {step === 2 && sub?.status === "reserved" ? (
        <>
          <p className="inv-reserve-note inv-reserve-left">{t.reservedNote}</p>
          <button className="inv-btn-reserve" type="button" disabled={busy} onClick={sign}>
            {busy ? t.signBusy : t.signBtn}
          </button>
          <button className="inv-ghost-btn" type="button" disabled={busy} onClick={cancel}>
            {t.cancelReservation}
          </button>
        </>
      ) : null}

      {/* ── Étape 4 (signé/financé) — Versement vers séquestre tiers ── */}
      {step === 3 && sub ? (
        <>
          {flux}
          <p className="inv-reserve-note inv-reserve-left">
            {t.fundNote(sequestreLabel, settlementCurrency)}
          </p>

          {sub.status === "signed" ? (
            <button className="inv-btn-reserve" type="button" disabled={busy} onClick={fund}>
              {busy ? t.fundBusy : t.fundBtn}
            </button>
          ) : null}

          {sub.status === "funded" ? (
            <Banner tone="success">
              {t.fundedBanner}{" "}
              {sub.withinCoolingOff ? t.coolingOffActive : t.coolingOffExpired}
            </Banner>
          ) : null}

          {(sub.status === "signed" || (sub.status === "funded" && sub.withinCoolingOff)) ? (
            <button className="inv-ghost-btn" type="button" disabled={busy} onClick={cancel}>
              {sub.status === "funded" ? t.withdrawBtn : t.cancelSubBtn}
            </button>
          ) : null}
        </>
      ) : null}

      {/* ── État sortie (annulé / rétracté / remboursé) ── */}
      {sub && ["cancelled", "withdrawn", "refunded"].includes(sub.status) ? (
        <p className="inv-reserve-note">
          {t.terminalNote(t.status[sub.status].toLowerCase())}
        </p>
      ) : null}

      <p className="inv-reserve-note">
        <Link href="/invest/subscriptions">{t.mySubscriptions}</Link>
      </p>
    </div>
  );
}
