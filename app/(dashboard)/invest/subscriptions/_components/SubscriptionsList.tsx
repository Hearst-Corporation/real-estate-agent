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
import { StatusPill, Banner, Toast, eur } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { Button } from "@/components/ui/button";
import { Text, TextLink } from "@/components/ui/text";

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

const ACTIONS_CLASS = "flex flex-wrap gap-2";

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
        <TextLink href="/invest">Parcourir les opportunités</TextLink> pour réserver une place — sans versement,
        révocable.
      </Banner>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Toast tone="error">{error}</Toast> : null}
      {notice ? <Toast tone="success">{notice}</Toast> : null}

      {items.map((s) => {
        const busy = busyId === s.id;
        return (
          <div
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-950/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]"
          >
            <div className="flex flex-col gap-1">
              <StatusPill tone={STATUS_TONE[s.status]}>{UI.invest.subscribe.status[s.status]}</StatusPill>
              <Text>
                {eur(s.amountEur)} {s.settlementCurrency} · {s.units} obligation(s)
                {s.status === "funded" && s.coolingOffEndsAt
                  ? ` · rétractation jusqu'au ${new Date(s.coolingOffEndsAt).toLocaleDateString("fr-FR")}`
                  : ""}
              </Text>
            </div>

            <div className={ACTIONS_CLASS}>
              {/* "Voir le deal" : pas de clé UI.invest.subscribe.* exacte — string conservée */}
              <Button outline href="/invest">
                Voir le deal
              </Button>

              {s.status === "reserved" ? (
                <Button
                  color="indigo"
                  disabled={busy}
                  onClick={() =>
                    act(s.id, `/api/invest/subscriptions/${s.id}/sign`, UI.invest.subscribe.notices.signUrl)
                  }
                >
                  {busy ? "…" : UI.invest.subscribe.signBtn}
                </Button>
              ) : null}

              {s.status === "signed" ? (
                <Button
                  color="indigo"
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
                </Button>
              ) : null}

              {s.status === "reserved" || s.status === "signed" ? (
                <Button
                  outline
                  disabled={busy}
                  onClick={() => act(s.id, `/api/invest/subscriptions/${s.id}/cancel`, UI.invest.subscribe.notices.cancelled)}
                >
                  {UI.invest.subscribe.cancelSubBtn}
                </Button>
              ) : null}

              {s.status === "funded" && s.withinCoolingOff ? (
                <Button
                  outline
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
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}

      <Text>
        {/* Disclaimer composite : UI.invest.subscribe.reserveNote + creditorNote couvrent partiellement
            mais pas cette phrase exacte — conservée, pas de clé exacte */}
        La réservation est non engageante et sans versement. Les fonds transitent par un séquestre tiers
        (jamais la plateforme). Tout rendement est une cible non garantie ; risque de perte en capital.
      </Text>
    </div>
  );
}
