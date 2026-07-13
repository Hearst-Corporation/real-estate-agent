"use client";
import { useEffect, useState } from "react";
import {
  UsersIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  BuildingOffice2Icon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { UI } from "@/lib/ui-strings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { Field, Label, FieldGroup } from "@/components/ui/fieldset";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "@/components/ui/table";
import { Text, Strong } from "@/components/ui/text";
import { ScrapeCustomModal } from "./_components/ScrapeCustomModal";
import { MATCH_SCORE_ALERT } from "@/lib/prospection/types";

// ─── Interfaces API ────────────────────────────────────────────────────────────

interface Annonce {
  id: string;
  type_bien: string;
  titre?: string;
  prix?: number;
  prix_m2?: number;
  surface_m2?: number;
  /** Alias legacy */
  surface?: number;
  nb_pieces?: number;
  /** Alias legacy */
  pieces?: number;
  nb_chambres?: number;
  code_postal?: string;
  commune?: string;
  /** Alias legacy */
  ville?: string;
  url?: string;
  photos_urls?: string[];
  /** Alias legacy */
  photos?: string[];
  is_pap?: boolean;
  type_annonceur?: "particulier" | "pro" | string;
  prix_baisse_delta?: number | null;
  dpe_note?: string | null;
  source_platform?: string;
  age_hours?: number | null;
  terrasse?: boolean;
  parking?: boolean;
  ascenseur?: boolean;
  jardin?: boolean;
  piscine?: boolean;
}

interface Match {
  id: string;
  score_match: number;
  alerte_envoyee?: boolean;
  created_at?: string;
  statut?: string;
  annonce_id?: string;
  critere_id?: string;
  date_match?: string;
  bonus_breakdown?: Record<string, number>;
  annonce: Annonce;
}

interface Critere {
  id: string;
  nom: string;
  zones?: unknown;
  budget_min?: number | null;
  budget_max?: number | null;
  surface_min?: number | null;
  surface_max?: number | null;
  pieces_min?: number | null;
  pieces_max?: number | null;
  type_bien?: string[] | null;
  telephone?: string | null;
  alerte_email?: boolean;
  alerte_whatsapp?: boolean;
}

type Tab = "acquereurs" | "matching" | "annonces" | "criteres";

const TABS: Tab[] = ["acquereurs", "matching", "annonces", "criteres"];

function tabLabel(t: Tab): string {
  return t === "acquereurs"
    ? UI.prospection.tabAcquereurs
    : t === "annonces"
    ? UI.prospection.annonces
    : t === "matching"
    ? UI.prospection.matching
    : UI.prospection.criteres;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function zonesLabel(zones: unknown): string {
  if (Array.isArray(zones)) return zones.join(", ");
  if (typeof zones === "string") return zones;
  return "—";
}

function budgetLabel(critere: Critere): string {
  const min = critere.budget_min ? `${Number(critere.budget_min).toLocaleString("fr-FR")} €` : null;
  const max = critere.budget_max ? `${Number(critere.budget_max).toLocaleString("fr-FR")} €` : null;
  if (min && max) return `${min} – ${max}`;
  return max ?? min ?? "Budget NC";
}

function annonceTitle(a: Annonce): string {
  return a.titre ?? a.type_bien ?? UI.prospection.annonceNoTitle;
}

function annonceSurface(a: Annonce): number | undefined {
  return a.surface_m2 ?? a.surface;
}

function annoncePieces(a: Annonce): number | undefined {
  return a.nb_pieces ?? a.pieces;
}

function annonceVille(a: Annonce): string | undefined {
  return a.commune ?? a.ville;
}

function annoncePhotos(a: Annonce): string[] {
  return a.photos_urls ?? a.photos ?? [];
}

function scoreClass(score: number): "is-good" | "is-ok" | "is-low" {
  if (score >= MATCH_SCORE_ALERT) return "is-good";
  if (score >= 55) return "is-ok";
  return "is-low";
}

// Score ring : accent indigo (bon) / zinc (moyen/faible) — pas de couleur hors accent.
const SCORE_TONE: Record<"is-good" | "is-ok" | "is-low", string> = {
  "is-good": "stroke-indigo-400 text-indigo-500 dark:text-indigo-400",
  "is-ok": "stroke-zinc-400 text-zinc-600 dark:text-zinc-300",
  "is-low": "stroke-zinc-500 text-zinc-500 dark:text-zinc-400",
};

// ─── Composant score ring (data-viz — gardé, tokenisé accent/zinc) ────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const cls = scoreClass(score);
  return (
    <div className="relative size-16 shrink-0" aria-label={`Score ${score}/100`}>
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={radius}
          className="fill-none stroke-zinc-950/10 dark:stroke-white/10"
          strokeWidth="6"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          strokeWidth="6"
          strokeLinecap="round"
          className={`fill-none transition-all ${SCORE_TONE[cls]}`}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${SCORE_TONE[cls]}`}>
        {score}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  icon: IconCmp,
  title,
  text,
  steps,
  action,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  title: string;
  text: string;
  steps?: string[];
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-950/10 px-6 py-12 text-center dark:border-white/10">
      <IconCmp aria-hidden="true" className="size-10 text-zinc-400 dark:text-zinc-500" />
      <Strong>{title}</Strong>
      <Text className="max-w-md">{text}</Text>
      {steps && steps.length > 0 && (
        <ol className="mt-2 flex flex-col gap-2 text-left" aria-label={UI.prospection.emptyStepsAria}>
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-300">
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-xs font-semibold text-indigo-500 dark:text-indigo-300"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
      {action}
    </div>
  );
}

// ─── Carte annonce (grille + primitives) ──────────────────────────────────────

function AnnonceCard({ annonce }: { annonce: Annonce }) {
  const photos = annoncePhotos(annonce);
  const surface = annonceSurface(annonce);
  const pieces = annoncePieces(annonce);
  const ville = annonceVille(annonce);
  const isPap = annonce.is_pap ?? annonce.type_annonceur === "particulier";
  const hasBaisse = annonce.prix_baisse_delta != null && annonce.prix_baisse_delta > 0;

  const metaParts: string[] = [];
  if (surface) metaParts.push(UI.prospection.annonceSurface(surface));
  if (pieces) metaParts.push(UI.prospection.annoncePieces(pieces));
  if (ville) metaParts.push(ville);
  else if (annonce.code_postal) metaParts.push(annonce.code_postal);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-zinc-950/10 dark:border-white/10">
      <div className="relative aspect-[4/3] w-full bg-zinc-950/[0.02] dark:bg-white/[0.02]">
        {photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photos[0]} alt={annonceTitle(annonce)} loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-zinc-400 dark:text-zinc-600" aria-hidden="true">
            <BuildingOffice2Icon className="size-12" />
          </div>
        )}
        <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1.5">
          {isPap && <Badge color="lime">{UI.prospection.badgePap}</Badge>}
          {!isPap && annonce.type_annonceur === "pro" && <Badge color="zinc">{UI.prospection.badgePro}</Badge>}
          {hasBaisse && <Badge color="amber">{UI.prospection.badgeBaissePrix}</Badge>}
          {annonce.dpe_note && <Badge color="zinc">{UI.prospection.badgeDpe(annonce.dpe_note)}</Badge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <Strong>{annonceTitle(annonce)}</Strong>
        {metaParts.length > 0 && <Text>{metaParts.join(" · ")}</Text>}

        {annonce.prix != null && (
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-zinc-950 dark:text-white">
              {UI.prospection.annoncePrix(annonce.prix)}
            </span>
            {annonce.prix_m2 != null && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {UI.prospection.annoncePrixM2(Math.round(annonce.prix_m2))}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {annonce.age_hours != null && <Badge color="zinc">{UI.prospection.badgeAge(annonce.age_hours)}</Badge>}
            {annonce.source_platform && <Badge color="zinc">{annonce.source_platform}</Badge>}
          </div>
          {annonce.url && (
            <a
              href={annonce.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-400 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              {UI.prospection.annonceVoir}
              <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-3.5" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ProspectionPage() {
  const [tab, setTab] = useState<Tab>("acquereurs");
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [matchs, setMatchs] = useState<Match[]>([]);
  const [criteres, setCriteres] = useState<Critere[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterEligible, setFilterEligible] = useState(false);

  async function loadAnnonces(nextFilterEligible = filterEligible) {
    setLoading(true);
    setError(null);
    try {
      const qs = nextFilterEligible ? "?eligible=1" : "";
      const res = await fetch(`/api/prospection/annonces${qs}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      if (json.degraded) setError(UI.prospection.degradedAnnonces);
      setAnnonces(json.data ?? []);
    } catch {
      setError(UI.prospection.loadAnnoncesError);
    } finally {
      setLoading(false);
    }
  }

  async function loadMatchs() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prospection/matchs");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      setMatchs(json.data ?? []);
    } catch {
      setError(UI.prospection.loadMatchsError);
    } finally {
      setLoading(false);
    }
  }

  async function loadCriteres() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prospection/criteres");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      setCriteres(json.data ?? []);
    } catch {
      setError(UI.prospection.loadCriteresError);
    } finally {
      setLoading(false);
    }
  }

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    if (nextTab === "annonces" && annonces.length === 0) void loadAnnonces();
    if (nextTab === "matching" && matchs.length === 0) void loadMatchs();
    if ((nextTab === "acquereurs" || nextTab === "criteres") && criteres.length === 0) void loadCriteres();
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialCriteres() {
      try {
        const res = await fetch("/api/prospection/criteres");
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Erreur HTTP ${res.status}`);
          return;
        }
        setCriteres(json.data ?? []);
      } catch {
        if (!cancelled) setError(UI.prospection.loadCriteresError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialCriteres();
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendFeedback(matchId: string, signal: "up" | "down") {
    setError(null);
    try {
      const res = await fetch("/api/prospection/matchs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, verdict: signal }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      await loadMatchs();
    } catch {
      setError(UI.prospection.feedbackError);
    }
  }

  const stats = [
    { name: UI.prospection.kpiAcquereurs, value: String(criteres.length) },
    { name: UI.prospection.kpiMatchs, value: String(matchs.length) },
    { name: UI.prospection.kpiAnnonces, value: String(annonces.length) },
    {
      name: UI.prospection.kpiAlertes,
      value: String(criteres.filter((c) => c.alerte_email || c.alerte_whatsapp).length),
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12 @container">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
              {UI.prospection.kicker}
            </p>
            <Heading>{UI.prospection.title}</Heading>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ScrapeCustomModal
              onDone={() => {
                setTab("matching");
                void loadAnnonces();
                void loadMatchs();
              }}
            />
            <Button color="indigo" onClick={() => selectTab("criteres")}>
              {UI.prospection.newAcquereurBtn}
            </Button>
          </div>
        </div>

        <nav
          className="flex flex-wrap items-center gap-1 border-b border-zinc-950/10 pb-2 dark:border-white/10"
          aria-label={UI.prospection.tabAcquereurs}
        >
          {TABS.map((tItem) => (
            <Button
              key={tItem}
              plain
              onClick={() => selectTab(tItem)}
              aria-current={tab === tItem ? "page" : undefined}
              className={tab === tItem ? "!text-indigo-500 dark:!text-indigo-400" : undefined}
            >
              {tabLabel(tItem)}
            </Button>
          ))}
        </nav>
      </div>

      {/* ── Stats (grille KPI + primitives) ── */}
      <dl className="grid grid-cols-2 gap-4 @2xl:grid-cols-4">
        {stats.map((item) => (
          <div key={item.name} className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
            <dt>
              <Text>{item.name}</Text>
            </dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="rounded-xl border border-zinc-950/10 p-5 dark:border-white/10">
        {/* ── Onglet acquéreurs ── */}
        {tab === "acquereurs" && (
          <div>
            {error && criteres.length > 0 ? <ErrorLine msg={error} /> : null}
            {loading ? (
              <Spinner />
            ) : criteres.length === 0 ? (
              <EmptyState
                icon={UsersIcon}
                title={UI.prospection.emptyCriteresTitle}
                text={UI.prospection.emptyCriteresText}
                steps={[
                  UI.prospection.emptyCriteresStep1,
                  UI.prospection.emptyCriteresStep2,
                  UI.prospection.emptyCriteresStep3,
                ]}
                action={
                  <Button color="indigo" className="mt-2" onClick={() => selectTab("criteres")}>
                    {UI.prospection.newCritere}
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{UI.prospection.colNom}</TableHeader>
                    <TableHeader>{UI.prospection.colBudget}</TableHeader>
                    <TableHeader>{UI.prospection.colZones}</TableHeader>
                    <TableHeader>{UI.prospection.colContact}</TableHeader>
                    <TableHeader>{UI.prospection.colCriteres}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {criteres.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Strong>{c.nom}</Strong>
                      </TableCell>
                      <TableCell>{budgetLabel(c)}</TableCell>
                      <TableCell>{zonesLabel(c.zones)}</TableCell>
                      <TableCell>{c.telephone ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {c.type_bien?.map((type) => (
                            <Badge key={type} color="zinc">
                              {type}
                            </Badge>
                          ))}
                          {c.surface_min ? (
                            <Badge color="zinc">{UI.prospection.annonceSurface(c.surface_min)} min</Badge>
                          ) : null}
                          {c.pieces_min ? (
                            <Badge color="zinc">{UI.prospection.annoncePieces(c.pieces_min)} min</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        {/* ── Onglet annonces ── */}
        {tab === "annonces" && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <CheckboxField>
                <Checkbox
                  checked={filterEligible}
                  onChange={(checked) => {
                    setFilterEligible(checked);
                    void loadAnnonces(checked);
                  }}
                />
                <Label>{UI.prospection.eligibleOnly}</Label>
              </CheckboxField>
              <Text>{UI.prospection.annonceCount(annonces.length)}</Text>
              <Button outline className="ml-auto" onClick={() => loadAnnonces()}>
                {UI.prospection.refresh}
              </Button>
            </div>

            {error && annonces.length > 0 ? <ErrorLine msg={error} /> : null}

            {loading ? (
              <Spinner />
            ) : annonces.length === 0 ? (
              <EmptyState
                icon={MagnifyingGlassIcon}
                title={UI.prospection.emptyAnnoncesTitle}
                text={UI.prospection.emptyAnnoncesText}
                steps={[
                  UI.prospection.emptyAnnoncesStep1,
                  UI.prospection.emptyAnnoncesStep2,
                  UI.prospection.emptyAnnoncesStep3,
                ]}
              />
            ) : (
              <ul className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
                {annonces.map((a) => (
                  <li key={a.id}>
                    <AnnonceCard annonce={a} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Onglet matching ── */}
        {tab === "matching" && (
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Text>{UI.prospection.matchingHint}</Text>
              <Button outline onClick={() => loadMatchs()}>
                {UI.prospection.refresh}
              </Button>
            </div>

            {error && matchs.length > 0 ? <ErrorLine msg={error} /> : null}

            {loading ? (
              <Spinner />
            ) : matchs.length === 0 ? (
              <EmptyState
                icon={SparklesIcon}
                title={UI.prospection.emptyMatchsTitle}
                text={UI.prospection.emptyMatchsText}
                steps={[
                  UI.prospection.emptyMatchsStep1,
                  UI.prospection.emptyMatchsStep2,
                  UI.prospection.emptyMatchsStep3,
                ]}
                action={
                  <Button color="indigo" className="mt-2" onClick={() => selectTab("criteres")}>
                    {UI.prospection.newCritere}
                  </Button>
                }
              />
            ) : (
              <MatchList
                matchs={matchs}
                onFeedback={sendFeedback}
                onContactSoon={() => setError(UI.prospection.contactSoon)}
              />
            )}
          </div>
        )}

        {/* ── Onglet critères ── */}
        {tab === "criteres" && <CriteresPanel onChanged={loadCriteres} />}
      </section>
    </div>
  );
}

// ─── Ligne d'erreur (Badge + Text, pattern repo) ──────────────────────────────

function ErrorLine({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 p-4">
      <Badge color="red">{UI.common.error}</Badge>
      <Text>{msg}</Text>
    </div>
  );
}

// ─── Match list (stacked list + primitives) ───────────────────────────────────

function MatchList({
  matchs,
  onFeedback,
  onContactSoon,
}: {
  matchs: Match[];
  onFeedback: (id: string, signal: "up" | "down") => Promise<void>;
  onContactSoon: () => void;
}) {
  // Trier : bons matchs en premier
  const sorted = [...matchs].sort((a, b) => b.score_match - a.score_match);

  return (
    <ul className="divide-y divide-zinc-950/5 dark:divide-white/5">
      {sorted.map((m) => {
        const a = m.annonce;
        const isGood = m.score_match >= MATCH_SCORE_ALERT;
        const surface = annonceSurface(a);
        const pieces = annoncePieces(a);
        const ville = annonceVille(a);
        const metaParts: string[] = [];
        if (surface) metaParts.push(UI.prospection.annonceSurface(surface));
        if (pieces) metaParts.push(UI.prospection.annoncePieces(pieces));
        if (ville) metaParts.push(ville);
        else if (a.code_postal) metaParts.push(a.code_postal);
        if (a.prix) metaParts.push(UI.prospection.annoncePrix(a.prix));

        return (
          <li key={m.id} className="flex flex-wrap items-center gap-4 py-4">
            <ScoreRing score={m.score_match} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Strong>{annonceTitle(a)}</Strong>
                {isGood && <Badge color="indigo">{UI.prospection.matchGoodLabel}</Badge>}
              </div>
              {metaParts.length > 0 && <Text>{metaParts.join(" · ")}</Text>}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button plain aria-label={UI.prospection.feedbackLikeAria} onClick={() => onFeedback(m.id, "up")}>
                👍
              </Button>
              <Button plain aria-label={UI.prospection.feedbackDislikeAria} onClick={() => onFeedback(m.id, "down")}>
                👎
              </Button>
              <Button color="indigo" title={UI.prospection.contactSoon} onClick={() => onContactSoon()}>
                {UI.prospection.matchContactBtn}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Panel critères ───────────────────────────────────────────────────────────

function CriteresPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [criteres, setCriteres] = useState<Critere[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState("");
  const [zones, setZones] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [surfaceMin, setSurfaceMin] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadCriteres() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prospection/criteres");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      setCriteres(json.data ?? []);
    } catch {
      setError(UI.prospection.loadCriteresError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialCriteres() {
      try {
        const res = await fetch("/api/prospection/criteres");
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Erreur HTTP ${res.status}`);
          return;
        }
        setCriteres(json.data ?? []);
      } catch {
        if (!cancelled) setError(UI.prospection.loadCriteresError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialCriteres();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!nom.trim()) {
      setError(UI.prospection.critereNameRequired);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/prospection/criteres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: nom.trim(),
          zones: zones.split(",").map((z) => z.trim()).filter(Boolean),
          budget_max: budgetMax ? Number(budgetMax) : null,
          surface_min: surfaceMin ? Number(surfaceMin) : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      await loadCriteres();
      await onChanged();
      setShowForm(false);
      setNom("");
      setZones("");
      setBudgetMax("");
      setSurfaceMin("");
    } catch {
      setError(UI.prospection.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCritere(id: string) {
    const critere = criteres.find((c) => c.id === id);
    if (!confirm(`${UI.prospection.delete} « ${critere?.nom ?? id} » ?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/prospection/criteres?id=${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      setCriteres((c) => c.filter((x) => x.id !== id));
    } catch {
      setError(UI.prospection.deleteError);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Text>{UI.prospection.criteresCount(criteres.length)}</Text>
        <div className="flex items-center gap-2">
          <Button outline onClick={loadCriteres}>
            {UI.prospection.refresh}
          </Button>
          <Button color="indigo" onClick={() => setShowForm((v) => !v)}>
            {UI.prospection.newCritere}
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
          <FieldGroup>
            <Field>
              <Label>{UI.prospection.critereNamePlaceholder}</Label>
              <Input
                placeholder={UI.prospection.critereNamePlaceholder}
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
            </Field>
            <Field>
              <Label>{UI.prospection.critereZonesPlaceholder}</Label>
              <Input
                placeholder={UI.prospection.critereZonesPlaceholder}
                value={zones}
                onChange={(e) => setZones(e.target.value)}
              />
            </Field>
            <Field>
              <Label>{UI.prospection.budgetMaxPlaceholder}</Label>
              <Input type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
            </Field>
            <Field>
              <Label>{UI.prospection.surfaceMinPlaceholder}</Label>
              <Input type="number" value={surfaceMin} onChange={(e) => setSurfaceMin(e.target.value)} />
            </Field>
            <Button color="indigo" className="w-fit" onClick={save} disabled={saving}>
              {saving ? UI.prospection.saving : UI.prospection.save}
            </Button>
          </FieldGroup>
        </div>
      )}

      <div>
        {error ? <ErrorLine msg={error} /> : null}
        {loading ? (
          <Spinner />
        ) : criteres.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title={UI.prospection.emptyCriteresTitle}
            text={UI.prospection.emptyCriteresText}
            steps={[
              UI.prospection.emptyCriteresStep1,
              UI.prospection.emptyCriteresStep2,
              UI.prospection.emptyCriteresStep3,
            ]}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{UI.prospection.colNom}</TableHeader>
                <TableHeader>{UI.prospection.colZones}</TableHeader>
                <TableHeader>{UI.prospection.colBudgetMax}</TableHeader>
                <TableHeader className="text-right">{UI.prospection.colAction}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {criteres.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Strong>{c.nom}</Strong>
                  </TableCell>
                  <TableCell>{zonesLabel(c.zones)}</TableCell>
                  <TableCell>
                    {c.budget_max ? `${Number(c.budget_max).toLocaleString("fr-FR")} €` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button plain onClick={() => deleteCritere(c.id)}>
                      {UI.prospection.delete}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2 py-12">
      <span
        className="size-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent dark:border-indigo-400"
        aria-hidden="true"
      />
      <Text>{UI.prospection.loading}</Text>
    </div>
  );
}
