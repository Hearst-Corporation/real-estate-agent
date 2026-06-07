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
import type { CSSProperties } from "react";
import Link from "next/link";
import { Stepper, Banner, Gate, StatusPill, Toast, eur } from "@/components/invest";

// Styles inline en tokens --ct-* (aucun hex, aucune nouvelle classe dans cockpit.css).
const fieldLabelStyle: CSSProperties = {
  fontSize: "var(--ct-fs-xs)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
};
const amountRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ct-space-sm)",
};
const amountCurStyle: CSSProperties = {
  fontSize: "var(--ct-fs-base)",
  fontWeight: 700,
  color: "var(--ct-text-muted)",
};
const ghostBtnStyle: CSSProperties = {
  width: "100%",
  padding: "var(--ct-space-sm) var(--ct-space-md)",
  borderRadius: 10,
  border: "1px solid var(--ct-border)",
  background: "transparent",
  color: "var(--ct-text-body)",
  fontSize: "var(--ct-fs-sm)",
  fontWeight: 700,
  cursor: "pointer",
};
const flowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--ct-space-sm)",
  flexWrap: "wrap",
  padding: "var(--ct-space-sm) var(--ct-space-md)",
  background: "var(--ct-surface-0)",
  border: "1px solid var(--ct-border-soft)",
  borderRadius: 10,
};
const flowNodeStyle: CSSProperties = {
  fontSize: "var(--ct-fs-xs)",
  fontWeight: 700,
  color: "var(--ct-text-body)",
  padding: "4px 8px",
  borderRadius: "var(--ct-radius-md)",
  border: "1px solid var(--ct-border-soft)",
  background: "var(--ct-surface-1)",
};
const flowNodeAccentStyle: CSSProperties = {
  ...flowNodeStyle,
  color: "var(--ct-accent-strong)",
  borderColor: "var(--ct-border-accent)",
  background: "var(--ct-accent-soft)",
};
const flowArrowStyle: CSSProperties = { color: "var(--ct-text-muted)", fontWeight: 800 };

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

const STEPS = [{ label: "Montant" }, { label: "Réserver" }, { label: "Signature" }, { label: "Versement" }];

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

const STATUS_LABEL: Record<SubStatus, string> = {
  reserved: "Réservé (non engageant)",
  signed: "Signé (eIDAS)",
  funded: "Fonds en séquestre",
  allocated: "Alloué au closing",
  minted: "Token émis",
  refunded: "Remboursé",
  cancelled: "Annulé",
  withdrawn: "Rétracté",
};

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
      if (reason.startsWith("deal_not_open")) return "Ce deal n'est plus ouvert à la souscription.";
      if (reason === "kyc_not_approved") return "Votre identité n'est pas encore vérifiée (KYC).";
      if (reason === "suitability_required")
        return "Le test d'adéquation (ECSP) doit être validé avant de réserver.";
      if (reason.startsWith("ticket_below_min"))
        return `Le ticket minimum est de ${eur(ticketMinEur)}.`;
      if (reason.startsWith("ticket_above_max"))
        return `Le ticket maximum est de ${eur(ticketMaxEur)}.`;
      if (reason.startsWith("annual_cap_exceeded")) {
        const m = /remaining=([\d.]+)/.exec(reason);
        const remaining = m ? Number(m[1]) : null;
        return remaining != null
          ? `Plafond annuel d'investissement atteint. Capacité restante sur 12 mois : ${eur(remaining)}.`
          : "Plafond annuel d'investissement (12 mois) atteint.";
      }
      if (reason === "cooling_off_expired")
        return "Le délai de rétractation de 4 jours est écoulé : l'annulation n'est plus possible.";
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
            ? "La signature électronique n'est pas encore disponible. Réessayez plus tard ; votre réservation est conservée."
            : err === "escrow_not_configured"
              ? "Le séquestre tiers n'est pas encore disponible. Réessayez plus tard ; votre souscription est conservée."
              : "Service indisponible pour le moment. Réessayez plus tard.",
        );
      }
      if (res.status === 422 && json.reason) throw new Error(reasonToMessage(String(json.reason)));
      throw new Error(String(json.error ?? "Une erreur est survenue."));
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
      setNotice("Place réservée — sans versement, révocable à tout moment.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la réservation.");
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
        setNotice("Demande de signature envoyée. Ouvrez le lien pour signer le bulletin.");
        window.open(sig.signUrl, "_blank", "noopener");
      } else {
        setNotice("Demande de signature envoyée. Vous recevrez le bulletin à signer par e-mail.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la demande de signature.");
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
      setNotice(
        "Instruction de versement émise vers le séquestre tiers. Délai de rétractation de 4 jours activé.",
      );
      if (funding?.coolingOffEndsAt && sub) {
        setSub({ ...sub, coolingOffEndsAt: funding.coolingOffEndsAt, withinCoolingOff: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'instruction de versement.");
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
      setNotice("Souscription annulée. Aucun engagement ne subsiste.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'annulation.");
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
          message="Vérifiez votre identité (KYC) pour réserver votre place."
          cta={
            <Link
              href="/invest/onboarding"
              className="inv-btn-reserve"
              style={{ display: "inline-block", textDecoration: "none" }}
            >
              Vérifier mon identité (KYC)
            </Link>
          }
        >
          <div style={{ minHeight: 120 }} />
        </Gate>
        <p className="inv-reserve-note">
          Vous prêtez à une société (vous êtes créancier) ; tout rendement est une cible non garantie.
        </p>
      </div>
    );
  }

  const flux = (
    <div style={flowStyle} aria-label="Flux des fonds : vous vers séquestre tiers vers SPV">
      <span style={flowNodeStyle}>Vous</span>
      <span style={flowArrowStyle} aria-hidden>
        →
      </span>
      <span style={flowNodeAccentStyle}>Séquestre tiers</span>
      <span style={flowArrowStyle} aria-hidden>
        →
      </span>
      <span style={flowNodeStyle}>{spvLabel || "SPV"}</span>
    </div>
  );

  return (
    <div className="inv-raise-box" id="subscribe">
      <Stepper steps={STEPS} current={step} />

      {sub ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--ct-space-sm)" }}>
          <StatusPill tone={STATUS_TONE[sub.status]}>{STATUS_LABEL[sub.status]}</StatusPill>
          <span className="inv-raise-stat" style={{ flexDirection: "row", gap: 6, alignItems: "baseline" }}>
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
          <label style={fieldLabelStyle} htmlFor="sub-amount">
            Montant de votre souscription
          </label>
          <div style={amountRowStyle}>
            <input
              id="sub-amount"
              className="ct-input"
              type="number"
              inputMode="numeric"
              min={ticketMinEur}
              max={ticketMaxEur}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-describedby="sub-amount-hint"
            />
            <span style={amountCurStyle}>{settlementCurrency}</span>
          </div>
          <p id="sub-amount-hint" className="inv-reserve-note" style={{ textAlign: "left" }}>
            Ticket de {eur(ticketMinEur)} à {eur(ticketMaxEur)}. Règlement en {settlementCurrency} par défaut.
          </p>
          {!amountValid && amount !== "" ? (
            <Banner tone="warn">
              Le montant doit être compris entre {eur(ticketMinEur)} et {eur(ticketMaxEur)}.
            </Banner>
          ) : null}
          <button
            className="inv-btn-reserve"
            type="button"
            disabled={!amountValid || busy || !props.dealOpen}
            onClick={reserve}
          >
            {busy ? "Réservation…" : "Réserver ma place"}
          </button>
          <p className="inv-reserve-note">Réservation non engageante · sans versement · révocable</p>
        </>
      ) : null}

      {/* ── Étape 2 (réservé) — Signature eIDAS ── */}
      {step === 2 && sub?.status === "reserved" ? (
        <>
          <p className="inv-reserve-note" style={{ textAlign: "left" }}>
            Votre place est réservée sans versement. Étape suivante : signer le bulletin de souscription
            (signature électronique eIDAS). Vous restez créancier de la société ; rien n&apos;est versé à
            cette étape.
          </p>
          <button className="inv-btn-reserve" type="button" disabled={busy} onClick={sign}>
            {busy ? "Envoi…" : "Signer le bulletin (eIDAS)"}
          </button>
          <button style={ghostBtnStyle} type="button" disabled={busy} onClick={cancel}>
            Annuler ma réservation
          </button>
        </>
      ) : null}

      {/* ── Étape 4 (signé/financé) — Versement vers séquestre tiers ── */}
      {step === 3 && sub ? (
        <>
          {flux}
          <p className="inv-reserve-note" style={{ textAlign: "left" }}>
            Votre versement va vers un séquestre tiers ({sequestreLabel}) — la plateforme ne reçoit jamais
            les fonds. Délai de rétractation de 4 jours, sans pénalité. Remboursement intégral si le deal
            n&apos;aboutit pas. Règlement en {settlementCurrency} par défaut.
          </p>

          {sub.status === "signed" ? (
            <button className="inv-btn-reserve" type="button" disabled={busy} onClick={fund}>
              {busy ? "Instruction…" : "Verser vers le séquestre tiers"}
            </button>
          ) : null}

          {sub.status === "funded" ? (
            <Banner tone="success">
              Fonds reçus en séquestre tiers.{" "}
              {sub.withinCoolingOff
                ? "Vous pouvez encore vous rétracter pendant le délai de 4 jours."
                : "Le délai de rétractation de 4 jours est écoulé."}
            </Banner>
          ) : null}

          {/* Annulation/rétractation possible tant qu'on est dans le délai 4j. */}
          {(sub.status === "signed" || (sub.status === "funded" && sub.withinCoolingOff)) ? (
            <button style={ghostBtnStyle} type="button" disabled={busy} onClick={cancel}>
              {sub.status === "funded" ? "Me rétracter (remboursement intégral)" : "Annuler ma souscription"}
            </button>
          ) : null}
        </>
      ) : null}

      {/* ── État sortie (annulé / rétracté / remboursé) ── */}
      {sub && ["cancelled", "withdrawn", "refunded"].includes(sub.status) ? (
        <p className="inv-reserve-note">
          Souscription {STATUS_LABEL[sub.status].toLowerCase()}. Vous pouvez réserver une nouvelle place
          ci-dessus.
        </p>
      ) : null}

      <p className="inv-reserve-note">
        <Link href="/invest/subscriptions">Voir mes souscriptions</Link>
      </p>
    </div>
  );
}
