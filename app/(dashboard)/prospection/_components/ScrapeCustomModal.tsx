"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from "@/components/ui/dialog";
import { Field, Label, FieldGroup } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Subheading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
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

  return (
    <>
      <Button color="indigo" className="!text-zinc-950" onClick={() => setOpen(true)}>
        {t.scrapeBtn}
      </Button>
      <Dialog open={open} onClose={setOpen} size="xl">
        <ScrapeCustomForm onClose={() => setOpen(false)} onDone={onDone} />
      </Dialog>
    </>
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
      <>
        <DialogTitle>{t.scrapeResultTitle}</DialogTitle>
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Text>{t.scrapeResultSummary(result.scraped, result.retained, result.inserted)}</Text>
            {empty ? (
              <Text className="py-4 text-center">{t.scrapeResultEmpty}</Text>
            ) : (
              <>
                <Text>{t.scrapeResultMatched(result.matched)}</Text>
                {result.topMatchs.length > 0 ? (
                  <>
                    <Subheading level={3}>{t.scrapeTopMatchsTitle}</Subheading>
                    <ul className="flex flex-col gap-1">
                      {result.topMatchs.map((m) => (
                        <li key={`${m.critereId}:${m.annonceId}`}>
                          <Text>{t.scrapeMatchLine(m.critereNom, m.score)}</Text>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button color="indigo" className="!text-zinc-950" onClick={onClose}>
            {t.scrapeCancel}
          </Button>
        </DialogActions>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogTitle>{t.scrapeModalTitle}</DialogTitle>
      <DialogDescription>{t.scrapeIntro}</DialogDescription>
      <DialogBody>
        <FieldGroup>
          <Field>
            <Label>{t.scrapeVille}</Label>
            <Input
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder={t.scrapeVillePlaceholder}
              required
            />
          </Field>

          <Field>
            <Label>{t.scrapeType}</Label>
            <Select
              value={typeBien}
              onChange={(e) => setTypeBien(e.target.value === "maison" ? "maison" : "appartement")}
            >
              <option value="appartement">{t.scrapeTypeAppart}</option>
              <option value="maison">{t.scrapeTypeMaison}</option>
            </Select>
          </Field>

          <Field>
            <Label>{t.scrapeBudgetMin}</Label>
            <Input type="number" min={0} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
          </Field>
          <Field>
            <Label>{t.scrapeBudgetMax}</Label>
            <Input type="number" min={0} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
          </Field>

          <Field>
            <Label>{t.scrapeSurfaceMin}</Label>
            <Input type="number" min={0} value={surfaceMin} onChange={(e) => setSurfaceMin(e.target.value)} />
          </Field>
          <Field>
            <Label>{t.scrapeSurfaceMax}</Label>
            <Input type="number" min={0} value={surfaceMax} onChange={(e) => setSurfaceMax(e.target.value)} />
          </Field>

          <Field>
            <Label>{t.scrapePiecesMin}</Label>
            <Input type="number" min={0} value={piecesMin} onChange={(e) => setPiecesMin(e.target.value)} />
          </Field>

          <Field>
            <Label>{t.scrapeMotsCles}</Label>
            <Input
              value={motsCles}
              onChange={(e) => setMotsCles(e.target.value)}
              placeholder={t.scrapeMotsClesPlaceholder}
            />
          </Field>

          {error && (
            <div className="flex items-center gap-2">
              <Badge color="red">{UI.common.error}</Badge>
              <Text>{error}</Text>
            </div>
          )}
        </FieldGroup>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t.scrapeCancel}
        </Button>
        <Button type="submit" color="indigo" className="!text-zinc-950" disabled={loading}>
          {loading ? t.scrapeSubmitting : t.scrapeSubmit}
        </Button>
      </DialogActions>
    </form>
  );
}
