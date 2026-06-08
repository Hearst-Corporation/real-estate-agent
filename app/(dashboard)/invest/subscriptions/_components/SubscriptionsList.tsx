"use client";

/**
 * SubscriptionsList — liste interactive de mes souscriptions (Epic 1.3, P5).
 *
 * StatusPill par état + actions contextuelles dérivées de la machine serveur :
 *   - `reserved` → Signer (eIDAS) · Annuler.
 *   - `signed`   → Verser (séquestre tiers) · Annuler.
 *   - `funded`   → Me rétracter (remboursement intégral) UNIQUEMENT pendant le
 *                  délai de réflexion 4j (withinCoolingOff).
 * Aucune transition n'est décidée côté client : on appelle les routes, qui
 * passent par la machine pure. États chargement / erreur / vide gérés.
 *
 * Anti-FIA : « réservation non engageante · sans versement · révocable » ;
 * séquestre tiers nommé ; créancier ; rendement non garanti ; risque de perte.
 */

import { useCallback, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { StatusPill, Banner, Toast, eur } from "@/components/invest";
import { UI } from "@/lib/ui-strings";

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
  dealId: string;
  status: SubStatus;
  amountEur: number;
  units: number;
  settlementCurrency: string;
  coolingOffEndsAt: string | null;
  withinCoolingOff: boolean;
  reservedAt: string;
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

const actionsStyle: CSSProperties = { display: "flex", gap: "var(--ct-space-sm)", flexWrap: "wrap" };
const metaStyle: CSSProperties = { fontSize: "var(--ct-fs-xs)", color: "var(--ct-text-muted)" };

export function SubscriptionsList({ initial }: { initial: SubscriptionView[] }) {
  const [items, setItems] = useState<SubscriptionView[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/invest/subscriptions");
      const json = await res.json();
      if (res.ok) setItems((json.items as SubscriptionView[]) ?? []);
    } catch {
      /* silencieux : on garde l'état courant */
    }
  }, []);

  const act = useCallback(
    async (id: string, path: string, okMessage: string) => {
      setBusyId(id);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(path, { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          if (res.status === 502) {
            throw new Error(
              "Service indisponible pour le moment. Votre souscription est conservée ; réessayez plus tard.",
            );
          }
          if (res.status === 422 && json.reason === "cooling_off_expired") {
            throw new Error("Le délai de rétractation de 4 jours est écoulé.");
          }
          throw new Error(String(json.error ?? json.reason ?? "Une erreur est survenue."));
        }
        setNotice(okMessage);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur.");
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  if (items.length === 0) {
    return (
      <Banner tone="info">
        Aucune souscription pour le moment.{" "}
        {/* "Parcourir les opportunités" : pas de clé UI.invest.subscribe.* exacte — string conservée */}
        <Link href="/invest">Parcourir les opportunités</Link> pour réserver une place — sans versement,
        révocable.
      </Banner>
    );
  }

  return (
    <div className="inv-stack-md">
      {error ? <Toast tone="error">{error}</Toast> : null}
      {notice ? <Toast tone="success">{notice}</Toast> : null}

      {items.map((s) => {
        const busy = busyId === s.id;
        return (
          <div key={s.id} className="inv-subscription-row">
            <div className="inv-stack-2xs">
              <StatusPill tone={STATUS_TONE[s.status]}>{UI.invest.subscribe.status[s.status]}</StatusPill>
              <span style={metaStyle}>
                {eur(s.amountEur)} {s.settlementCurrency} · {s.units} obligation(s)
                {s.status === "funded" && s.coolingOffEndsAt
                  ? ` · rétractation jusqu'au ${new Date(s.coolingOffEndsAt).toLocaleDateString("fr-FR")}`
                  : ""}
              </span>
            </div>

            <div style={actionsStyle}>
              {/* "Voir le deal" : pas de clé UI.invest.subscribe.* exacte — string conservée */}
              <Link href={`/invest`} className="inv-subscription-btn-ghost">
                Voir le deal
              </Link>

              {s.status === "reserved" ? (
                <button
                  className="inv-subscription-btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(s.id, `/api/invest/subscriptions/${s.id}/sign`, UI.invest.subscribe.notices.signUrl)
                  }
                >
                  {busy ? "…" : UI.invest.subscribe.signBtn}
                </button>
              ) : null}

              {s.status === "signed" ? (
                <button
                  className="inv-subscription-btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      s.id,
                      `/api/invest/subscriptions/${s.id}/fund`,
                      UI.invest.subscribe.notices.funded,
                    )
                  }
                >
                  {busy ? "…" : UI.invest.subscribe.fundBtn}
                </button>
              ) : null}

              {s.status === "reserved" || s.status === "signed" ? (
                <button
                  className="inv-subscription-btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => act(s.id, `/api/invest/subscriptions/${s.id}/cancel`, UI.invest.subscribe.notices.cancelled)}
                >
                  {UI.invest.subscribe.cancelSubBtn}
                </button>
              ) : null}

              {s.status === "funded" && s.withinCoolingOff ? (
                <button
                  className="inv-subscription-btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      s.id,
                      `/api/invest/subscriptions/${s.id}/cancel`,
                      /* "Rétractation enregistrée. Remboursement intégral depuis le séquestre tiers." :
                         pas de clé exacte — withdrawBtn utilisé comme label bouton, notice conservée */
                      "Rétractation enregistrée. Remboursement intégral depuis le séquestre tiers.",
                    )
                  }
                >
                  {UI.invest.subscribe.withdrawBtn}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}

      <p style={metaStyle}>
        {/* Disclaimer composite : UI.invest.subscribe.reserveNote + creditorNote couvrent partiellement
            mais pas cette phrase exacte — conservée, pas de clé exacte */}
        La réservation est non engageante et sans versement. Les fonds transitent par un séquestre tiers
        (jamais la plateforme). Tout rendement est une cible non garantie ; risque de perte en capital.
      </p>
    </div>
  );
}
