"use client";

/**
 * OffmarketExplorer — sélecteur de bien du portefeuille → acquéreurs matchés.
 *
 * Le score et la recommandation viennent du GET /api/offmarket (moteur de
 * matching de la prospection). Rien n'est calculé côté client. L'agent
 * sélectionne des biens et génère un lien partageable via POST /api/offmarket.
 *
 * Primitives Catalyst uniquement (Button/Checkbox/Input/Badge) — zéro natif.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/cockpit/primitives";

export type PortfolioProperty = {
  id: string;
  title: string | null;
  property_type: string | null;
  city: string | null;
  surface: number | null;
  asking_price: number | null;
};

type Match = {
  critereId: string;
  critereNom: string;
  leadId: string | null;
  score: number;
  recommandation: "high_priority" | "review" | "low_priority" | "rejected";
  breakdown: Record<string, number>;
  satisfaits: string[];
  nonSatisfaits: string[];
};

const RECO_LABEL: Record<Match["recommandation"], string> = {
  high_priority: "Priorité haute",
  review: "À revoir",
  low_priority: "Priorité basse",
  rejected: "Rejeté",
};

const RECO_COLOR: Record<Match["recommandation"], "green" | "amber" | "zinc"> = {
  high_priority: "green",
  review: "amber",
  low_priority: "zinc",
  rejected: "zinc",
};

function fmtEur(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function OffmarketExplorer({ properties }: { properties: PortfolioProperty[] }) {
  const [selectedProperty, setSelectedProperty] = useState<PortfolioProperty | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sélection partageable en construction : critère cible + biens inclus.
  const [selectedCritere, setSelectedCritere] = useState<Match | null>(null);
  const [chosenPropertyIds, setChosenPropertyIds] = useState<Set<string>>(new Set());
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadMatches = useCallback(async (p: PortfolioProperty) => {
    setSelectedProperty(p);
    setMatches(null);
    setError(null);
    setSelectedCritere(null);
    setShareUrl(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/offmarket?propertyId=${encodeURIComponent(p.id)}`, { cache: "no-store" });
      if (!res.ok) {
        setError(res.status === 404 ? "Bien introuvable." : "Impossible de charger les acquéreurs.");
        setMatches([]);
        return;
      }
      const json = (await res.json()) as { matches: Match[] };
      setMatches(json.matches ?? []);
    } catch {
      setError("Erreur réseau.");
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const setChosen = useCallback((id: string, on: boolean) => {
    setChosenPropertyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const createSelection = useCallback(async () => {
    if (!selectedCritere || chosenPropertyIds.size === 0) return;
    setCreating(true);
    setError(null);
    setShareUrl(null);
    try {
      const res = await fetch("/api/offmarket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          titre: `Sélection — ${selectedCritere.critereNom}`,
          critereId: selectedCritere.critereId,
          leadId: selectedCritere.leadId,
          propertyIds: Array.from(chosenPropertyIds),
        }),
      });
      if (res.status === 503) {
        setError("Fonctionnalité non disponible (table de sélection non déployée).");
        return;
      }
      if (!res.ok) {
        setError("Impossible de créer la sélection.");
        return;
      }
      const json = (await res.json()) as { shareUrl: string };
      setShareUrl(json.shareUrl);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setCreating(false);
    }
  }, [selectedCritere, chosenPropertyIds]);

  if (properties.length === 0) {
    return (
      <Card>
        <p className="text-sm text-zinc-500">
          Aucun bien dans le portefeuille. Ajoutez un bien pour lancer le matching off-market.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* Colonne biens du portefeuille */}
      <Card title="Portefeuille" titleAs="label">
        <ul className="flex flex-col gap-2">
          {properties.map((p) => {
            const active = selectedProperty?.id === p.id;
            return (
              <li key={p.id}>
                <div
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    active
                      ? "border-accent-500/50 bg-accent-500/5"
                      : "border-zinc-950/10 dark:border-white/10"
                  }`}
                >
                  <Checkbox
                    color="indigo"
                    checked={chosenPropertyIds.has(p.id)}
                    onChange={(on: boolean) => setChosen(p.id, on)}
                    aria-label={`Inclure ${p.title ?? "ce bien"} dans la sélection`}
                  />
                  <Button plain onClick={() => loadMatches(p)} className="min-w-0 flex-1 !justify-start !text-left">
                    <span className="block min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {p.title ?? "Bien sans titre"}
                      </span>
                      <span className="block truncate text-xs font-normal text-zinc-500">
                        {[p.property_type, p.city, p.surface ? `${p.surface} m²` : null, fmtEur(p.asking_price)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Colonne acquéreurs matchés + création de sélection */}
      <div className="flex flex-col gap-6">
        <Card
          title={selectedProperty ? `Acquéreurs pour « ${selectedProperty.title ?? "bien"} »` : "Acquéreurs correspondants"}
          titleAs="section"
        >
          {!selectedProperty ? (
            <p className="text-sm text-zinc-500">Sélectionnez un bien pour voir les acquéreurs correspondants.</p>
          ) : loading ? (
            <p className="text-sm text-zinc-500" aria-live="polite">Calcul des correspondances…</p>
          ) : error && !shareUrl ? (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          ) : matches && matches.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucun acquéreur ne correspond à ce bien.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(matches ?? []).map((m) => {
                const isTarget = selectedCritere?.critereId === m.critereId;
                return (
                  <li
                    key={m.critereId}
                    className={`rounded-lg border p-4 ${
                      isTarget ? "border-accent-500/50 bg-accent-500/5" : "border-zinc-950/10 dark:border-white/10"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{m.critereNom}</span>
                          <Badge color={RECO_COLOR[m.recommandation]}>{RECO_LABEL[m.recommandation]}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {m.satisfaits.length > 0 ? `Satisfait : ${m.satisfaits.join(", ")}` : "—"}
                          {m.nonSatisfaits.length > 0 ? ` · Écart : ${m.nonSatisfaits.join(", ")}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{m.score}</span>
                        {isTarget ? (
                          <Button
                            color="indigo"
                            onClick={() => {
                              setSelectedCritere(m);
                              if (selectedProperty) setChosen(selectedProperty.id, true);
                            }}
                          >
                            Cible
                          </Button>
                        ) : (
                          <Button
                            outline
                            onClick={() => {
                              setSelectedCritere(m);
                              if (selectedProperty) setChosen(selectedProperty.id, true);
                            }}
                          >
                            Cibler
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Bloc création de sélection partageable */}
        {selectedCritere ? (
          <Card title="Sélection partageable" titleAs="section">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Acquéreur cible : <span className="font-semibold">{selectedCritere.critereNom}</span> ·{" "}
              {chosenPropertyIds.size} bien{chosenPropertyIds.size > 1 ? "s" : ""} coché
              {chosenPropertyIds.size > 1 ? "s" : ""} (cochez les biens dans le portefeuille).
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                color="indigo"
                disabled={creating || chosenPropertyIds.size === 0}
                onClick={createSelection}
              >
                {creating ? "Génération…" : "Générer le lien partageable"}
              </Button>
              {shareUrl ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Input
                    readOnly
                    value={shareUrl}
                    aria-label="Lien de partage"
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1"
                  />
                  <Button outline onClick={() => navigator.clipboard?.writeText(shareUrl)}>Copier</Button>
                </div>
              ) : null}
            </div>
            {error ? <p className="mt-3 text-sm text-red-600" role="alert">{error}</p> : null}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
