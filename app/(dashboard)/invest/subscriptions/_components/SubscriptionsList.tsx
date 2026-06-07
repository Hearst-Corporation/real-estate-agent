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

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--ct-space-md)",
  padding: "var(--ct-space-md) var(--ct-space-lg)",
  background: "var(--ct-surface-1)",
  border: "1px solid var(--ct-border)",
  borderRadius: "var(--ct-radius-lg)",
  flexWrap: "wrap",
};
const actionsStyle: CSSProperties = { display: "flex", gap: "var(--ct-space-sm)", flexWrap: "wrap" };
const primaryBtn: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 9,
  border: "1px solid var(--ct-border-accent)",
  background: "var(--ct-accent-strong)",
  color: "var(--ct-bg-deep)",
  fontSize: "var(--ct-fs-sm)",
  fontWeight: 700,
  cursor: "pointer",
};
const ghostBtn: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 9,
  border: "1px solid var(--ct-border)",
  background: "transparent",
  color: "var(--ct-text-body)",
  fontSize: "var(--ct-fs-sm)",
  fontWeight: 700,
  cursor: "pointer",
};
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
        <Link href="/invest">Parcourir les opportunités</Link> pour réserver une place — sans versement,
        révocable.
      </Banner>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-md)" }}>
      {error ? <Toast tone="error">{error}</Toast> : null}
      {notice ? <Toast tone="success">{notice}</Toast> : null}

      {items.map((s) => {
        const busy = busyId === s.id;
        return (
          <div key={s.id} style={rowStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <StatusPill tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</StatusPill>
              <span style={metaStyle}>
                {eur(s.amountEur)} {s.settlementCurrency} · {s.units} obligation(s)
                {s.status === "funded" && s.coolingOffEndsAt
                  ? ` · rétractation jusqu'au ${new Date(s.coolingOffEndsAt).toLocaleDateString("fr-FR")}`
                  : ""}
              </span>
            </div>

            <div style={actionsStyle}>
              <Link href={`/invest`} style={ghostBtn}>
                Voir le deal
              </Link>

              {s.status === "reserved" ? (
                <button
                  style={primaryBtn}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(s.id, `/api/invest/subscriptions/${s.id}/sign`, "Demande de signature envoyée.")
                  }
                >
                  {busy ? "…" : "Signer (eIDAS)"}
                </button>
              ) : null}

              {s.status === "signed" ? (
                <button
                  style={primaryBtn}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      s.id,
                      `/api/invest/subscriptions/${s.id}/fund`,
                      "Versement vers le séquestre tiers instruit. Délai de rétractation de 4 jours activé.",
                    )
                  }
                >
                  {busy ? "…" : "Verser (séquestre tiers)"}
                </button>
              ) : null}

              {s.status === "reserved" || s.status === "signed" ? (
                <button
                  style={ghostBtn}
                  type="button"
                  disabled={busy}
                  onClick={() => act(s.id, `/api/invest/subscriptions/${s.id}/cancel`, "Souscription annulée.")}
                >
                  Annuler
                </button>
              ) : null}

              {s.status === "funded" && s.withinCoolingOff ? (
                <button
                  style={ghostBtn}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      s.id,
                      `/api/invest/subscriptions/${s.id}/cancel`,
                      "Rétractation enregistrée. Remboursement intégral depuis le séquestre tiers.",
                    )
                  }
                >
                  Me rétracter
                </button>
              ) : null}
            </div>
          </div>
        );
      })}

      <p style={metaStyle}>
        La réservation est non engageante et sans versement. Les fonds transitent par un séquestre tiers
        (jamais la plateforme). Tout rendement est une cible non garantie ; risque de perte en capital.
      </p>
    </div>
  );
}
