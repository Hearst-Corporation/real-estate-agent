"use client";

import { useState } from "react";
import { AccessibleModal } from "@/components/cockpit/AccessibleModal";
import { CockpitForm, Field, TextInput, Select, MoneyInput } from "@/components/cockpit/form";
import { UI } from "@/lib/ui-strings";

const t = UI.prospection;

type ScrapeResult = {
  scraped: number;
  retained: number;
  inserted: number;
  duplicates: number;
  matched: number;
  topMatchs: { annonceId: string; critereId: string; critereNom: string; score: number }[];
};

/**
 * Bouton « Lancer une prospection » + modale de critères personnalisés.
 * Au submit : POST /api/prospection/scrape-custom → affiche un résumé.
 * `onDone` permet au parent de rafraîchir les onglets annonces/matching.
 */
export function ScrapeCustomModal({
  onDone,
}: {
  onDone?: (result: ScrapeResult) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
        onClick={() => setOpen(true)}
      >
        {t.scrapeBtn}
      </button>
    );
  }

  return (
    <AccessibleModal title={t.scrapeModalTitle} onClose={() => setOpen(false)}>
      <ScrapeCustomForm onClose={() => setOpen(false)} onDone={onDone} />
    </AccessibleModal>
  );
}

function ScrapeCustomForm({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone?: (result: ScrapeResult) => void;
}) {
  const [zone, setZone] = useState("");
  const [typeBien, setTypeBien] = useState<"appartement" | "maison">("appartement");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [surfaceMin, setSurfaceMin] = useState("");
  const [surfaceMax, setSurfaceMax] = useState("");
  const [piecesMin, setPiecesMin] = useState("");
  const [motsCles, setMotsCles] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!zone.trim()) {
      setError(t.scrapeVilleRequired);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/prospection/scrape-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zone: zone.trim(),
          typeBien,
          budgetMin: budgetMin || null,
          budgetMax: budgetMax || null,
          surfaceMin: surfaceMin || null,
          surfaceMax: surfaceMax || null,
          piecesMin: piecesMin || null,
          motsCles,
        }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error === "no_listings_provider" ? t.scrapeNoProvider : t.scrapeError);
        return;
      }

      const json = (await res.json()) as ScrapeResult;
      setResult(json);
      onDone?.(json);
    } catch {
      setError(t.scrapeError);
    } finally {
      setLoading(false);
    }
  }

  // Vue résultat : résumé clair + top matchs (ou empty state).
  if (result) {
    const empty = result.scraped === 0 || result.retained === 0;
    return (
      <div className="flex flex-col gap-3">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {t.scrapeResultTitle}
        </div>
        <p className="text-sm text-slate-300">
          {t.scrapeResultSummary(result.scraped, result.retained, result.inserted)}
        </p>
        {empty ? (
          <p className="py-4 text-center text-sm text-slate-500">{t.scrapeResultEmpty}</p>
        ) : (
          <>
            <p className="text-sm text-slate-400">{t.scrapeResultMatched(result.matched)}</p>
            {result.topMatchs.length > 0 ? (
              <>
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {t.scrapeTopMatchsTitle}
                </div>
                <ul className="flex flex-col gap-1">
                  {result.topMatchs.map((m) => (
                    <li key={`${m.critereId}:${m.annonceId}`} className="text-sm text-slate-400">
                      {t.scrapeMatchLine(m.critereNom, m.score)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
            onClick={onClose}
          >
            {t.scrapeCancel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <CockpitForm onSubmit={handleSubmit}>
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        {t.scrapeModalTitle}
      </div>
      <p className="text-sm text-slate-400">{t.scrapeIntro}</p>

      <Field label={t.scrapeVille} htmlFor="scrape-zone" required>
        <TextInput
          id="scrape-zone"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          placeholder={t.scrapeVillePlaceholder}
          required
        />
      </Field>

      <Field label={t.scrapeType} htmlFor="scrape-type">
        <Select
          id="scrape-type"
          value={typeBien}
          onChange={(e) => setTypeBien(e.target.value === "maison" ? "maison" : "appartement")}
          options={[
            { value: "appartement", label: t.scrapeTypeAppart },
            { value: "maison", label: t.scrapeTypeMaison },
          ]}
        />
      </Field>

      <Field label={t.scrapeBudgetMin} htmlFor="scrape-budget-min">
        <MoneyInput id="scrape-budget-min" min={0} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
      </Field>
      <Field label={t.scrapeBudgetMax} htmlFor="scrape-budget-max">
        <MoneyInput id="scrape-budget-max" min={0} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
      </Field>

      <Field label={t.scrapeSurfaceMin} htmlFor="scrape-surface-min">
        <TextInput id="scrape-surface-min" type="number" min={0} value={surfaceMin} onChange={(e) => setSurfaceMin(e.target.value)} />
      </Field>
      <Field label={t.scrapeSurfaceMax} htmlFor="scrape-surface-max">
        <TextInput id="scrape-surface-max" type="number" min={0} value={surfaceMax} onChange={(e) => setSurfaceMax(e.target.value)} />
      </Field>

      <Field label={t.scrapePiecesMin} htmlFor="scrape-pieces-min">
        <TextInput id="scrape-pieces-min" type="number" min={0} value={piecesMin} onChange={(e) => setPiecesMin(e.target.value)} />
      </Field>

      <Field label={t.scrapeMotsCles} htmlFor="scrape-mots-cles">
        <TextInput
          id="scrape-mots-cles"
          value={motsCles}
          onChange={(e) => setMotsCles(e.target.value)}
          placeholder={t.scrapeMotsClesPlaceholder}
        />
      </Field>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading}
        >
          {loading ? t.scrapeSubmitting : t.scrapeSubmit}
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
          onClick={onClose}
        >
          {t.scrapeCancel}
        </button>
      </div>
    </CockpitForm>
  );
}
