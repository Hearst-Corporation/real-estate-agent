"use client";
import { useEffect, useState } from "react";
import {
  MagnifyingGlassIcon,
  SparklesIcon,
  BuildingOffice2Icon,
  ArrowTopRightOnSquareIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
} from "@heroicons/react/24/outline";
import { UI } from "@/lib/ui-strings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text, Strong } from "@/components/ui/text";
import { ScrapeCustomModal } from "./_components/ScrapeCustomModal";
import { AnnonceDetailDialog } from "./_components/AnnonceDetailDialog";
import { RecoBadge, MatchReasons } from "./_components/MatchReasons";
import { CritereForm } from "./_components/CritereForm";
import { AcquereurProfiles } from "./_components/AcquereurProfiles";
import { HistoryPanel } from "./_components/HistoryPanel";
import { AlertsPanel } from "./_components/AlertsPanel";
import { matchReco } from "./_components/reco";
import type { Annonce, Match, Critere } from "./_components/types";
import { MATCH_SCORE_ALERT } from "@/lib/prospection/types";

type Tab = "acquereurs" | "matching" | "annonces" | "historique" | "alertes";

const TABS: Tab[] = ["acquereurs", "matching", "annonces", "historique", "alertes"];

function tabLabel(t: Tab): string {
  return t === "acquereurs"
    ? UI.prospection.tabProfils
    : t === "annonces"
    ? UI.prospection.annonces
    : t === "matching"
    ? UI.prospection.matching
    : t === "historique"
    ? UI.prospection.tabHistorique
    : UI.prospection.tabAlertes;
}

// ─── Helpers annonce ──────────────────────────────────────────────────────────

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

// Score ring : accent (bon) / zinc (moyen/faible) — pas de couleur hors accent.
const SCORE_TONE: Record<"is-good" | "is-ok" | "is-low", string> = {
  "is-good": "stroke-accent-400 text-accent-500 dark:text-accent-400",
  "is-ok": "stroke-zinc-400 text-zinc-600 dark:text-zinc-300",
  "is-low": "stroke-zinc-500 text-zinc-500 dark:text-zinc-400",
};

function ScoreRing({ score }: { score: number }) {
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const cls = scoreClass(score);
  return (
    <div className="relative size-16 shrink-0" aria-label={UI.prospection.historyScore(score)}>
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={radius} className="fill-none stroke-zinc-950/10 dark:stroke-white/10" strokeWidth="6" />
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
      <div className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${SCORE_TONE[cls]}`}>{score}</div>
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
    <div className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
      <IconCmp aria-hidden="true" className="size-10 text-zinc-400 dark:text-zinc-500" />
      <Strong>{title}</Strong>
      <Text className="max-w-md">{text}</Text>
      {steps && steps.length > 0 && (
        <ol className="mt-2 flex flex-col gap-2 text-left" aria-label={UI.prospection.emptyStepsAria}>
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-300">
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-700 dark:text-accent-300"
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

// ─── Carte annonce ────────────────────────────────────────────────────────────

function AnnonceCard({ annonce, onOpenDetail }: { annonce: Annonce; onOpenDetail: (a: Annonce) => void }) {
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
    <article className="surface surface-hover flex flex-col overflow-hidden">
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
            <span className="text-lg font-bold text-zinc-950 dark:text-white">{UI.prospection.annoncePrix(annonce.prix)}</span>
            {annonce.prix_m2 != null && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{UI.prospection.annoncePrixM2(Math.round(annonce.prix_m2))}</span>
            )}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge color="zinc">{UI.prospection.detailProviderTag}</Badge>
            {annonce.age_hours != null && <Badge color="zinc">{UI.prospection.badgeAge(annonce.age_hours)}</Badge>}
            {(annonce.source_platform ?? annonce.source) && <Badge color="zinc">{annonce.source_platform ?? annonce.source}</Badge>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button plain onClick={() => onOpenDetail(annonce)}>
              {UI.prospection.detailOpen}
            </Button>
            {annonce.url && (
              <a
                href={annonce.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-500 dark:text-accent-400 dark:hover:text-accent-300"
              >
                {UI.prospection.annonceVoir}
                <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-3.5" />
              </a>
            )}
          </div>
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
  const [detailAnnonce, setDetailAnnonce] = useState<Annonce | null>(null);
  const [detailMatch, setDetailMatch] = useState<Match | undefined>(undefined);
  // Formulaire de création de profil (ouvert depuis « Nouvel acquéreur »).
  const [createOpen, setCreateOpen] = useState(false);

  function openAnnonceDetail(a: Annonce, m?: Match) {
    setDetailAnnonce(a);
    setDetailMatch(m);
  }
  function closeDetail() {
    setDetailAnnonce(null);
    setDetailMatch(undefined);
  }

  async function loadAnnonces() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prospection/annonces`);
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
    }
  }

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    if (nextTab === "annonces" && annonces.length === 0) void loadAnnonces();
    if (nextTab === "matching" && matchs.length === 0) void loadMatchs();
  }

  // Chargement initial des critères (utilisés par profils / historique / alertes).
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
    })();
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
        body: JSON.stringify({ match_id: matchId, signal }),
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

  const highPriorityCount = matchs.filter((m) => matchReco(m) === "high_priority").length;

  const stats = [
    { name: UI.prospection.kpiAcquereurs, value: String(criteres.length) },
    { name: UI.prospection.kpiMatchs, value: String(matchs.length) },
    { name: UI.prospection.kpiHighPriority, value: String(highPriorityCount) },
    { name: UI.prospection.kpiAnnonces, value: String(annonces.length) },
  ];

  return (
    <div className="flex flex-col gap-4 pb-12 @container">
      {/* ── Header : titre + actions + KPI compacts sur une bande dense ── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-600 dark:text-accent-400">{UI.prospection.kicker}</p>
            <Heading className="font-titre">{UI.prospection.title}</Heading>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
            <ScrapeCustomModal
              onDone={() => {
                setTab("matching");
                void loadAnnonces();
                void loadMatchs();
              }}
            />
            <Button
              outline
              onClick={() => {
                setTab("acquereurs");
                setCreateOpen(true);
              }}
            >
              {UI.prospection.newAcquereurBtn}
            </Button>
          </div>
        </div>

        {/* KPI compacts : bande dense (value + label). 2 col sur mobile (labels
            au large), 4 col dès que la largeur le permet. */}
        <dl className="surface grid grid-cols-2 divide-x divide-y divide-zinc-950/8 @md:grid-cols-4 @md:divide-y-0 dark:divide-white/10">
          {stats.map((item) => (
            <div key={item.name} className="flex items-baseline gap-2 px-3 py-2.5">
              <dd className="text-lg font-semibold tracking-tight tabular-nums text-zinc-950 dark:text-white @md:text-xl">{item.value}</dd>
              <dt className="truncate text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{item.name}</dt>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Onglets : contrôle segmenté, actif clair (pilule accent), scrollable mobile ── */}
      <nav
        className="scrollbar-thin -mx-1 flex items-center gap-0.5 overflow-x-auto px-1 pb-0.5"
        aria-label={UI.prospection.tabProfils}
      >
        {TABS.map((tItem) => {
          const isActive = tab === tItem;
          return (
            <Button
              key={tItem}
              plain
              onClick={() => selectTab(tItem)}
              aria-current={isActive ? "page" : undefined}
              className={
                "shrink-0 whitespace-nowrap !text-sm " +
                (isActive
                  ? "!bg-accent-500/15 !text-accent-700 dark:!bg-accent-500/20 dark:!text-accent-300"
                  : "!text-zinc-600 dark:!text-zinc-400")
              }
            >
              {tabLabel(tItem)}
            </Button>
          );
        })}
      </nav>

      {/* ── Onglet profils de recherche (acquéreurs regroupés) ── */}
      {tab === "acquereurs" && (
        <section className="flex flex-col gap-4">
          {error && <ErrorLine msg={error} />}
          {createOpen && (
            <CritereForm
              onSaved={async () => {
                setCreateOpen(false);
                await loadCriteres();
              }}
              onCancel={() => setCreateOpen(false)}
            />
          )}
          {loading ? (
            <div className="surface p-5">
              <Spinner />
            </div>
          ) : criteres.length === 0 && !createOpen ? (
            <EmptyState
              icon={SparklesIcon}
              title={UI.prospection.emptyCriteresTitle}
              text={UI.prospection.emptyCriteresText}
              steps={[UI.prospection.emptyCriteresStep1, UI.prospection.emptyCriteresStep2, UI.prospection.emptyCriteresStep3]}
              action={
                <Button color="indigo" className="mt-2 !text-zinc-950" onClick={() => setCreateOpen(true)}>
                  {UI.prospection.newCritere}
                </Button>
              }
            />
          ) : (
            <AcquereurProfiles criteres={criteres} onChanged={loadCriteres} />
          )}
        </section>
      )}

      {/* ── Onglet annonces ── */}
      {tab === "annonces" && (
        <section className="surface p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
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
              steps={[UI.prospection.emptyAnnoncesStep1, UI.prospection.emptyAnnoncesStep2, UI.prospection.emptyAnnoncesStep3]}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {annonces.map((a) => (
                <li key={a.id}>
                  <AnnonceCard annonce={a} onOpenDetail={(x) => openAnnonceDetail(x)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Onglet matching ── */}
      {tab === "matching" && (
        <section className="surface p-5">
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
              steps={[UI.prospection.emptyMatchsStep1, UI.prospection.emptyMatchsStep2, UI.prospection.emptyMatchsStep3]}
              action={
                <Button
                  color="indigo"
                  className="mt-2 !text-zinc-950"
                  onClick={() => {
                    setTab("acquereurs");
                    setCreateOpen(true);
                  }}
                >
                  {UI.prospection.newCritere}
                </Button>
              }
            />
          ) : (
            <MatchList matchs={matchs} onFeedback={sendFeedback} onOpenDetail={(a, m) => openAnnonceDetail(a, m)} />
          )}
        </section>
      )}

      {/* ── Onglet historique ── */}
      {tab === "historique" && (
        <section>
          <HistoryPanel criteres={criteres} />
        </section>
      )}

      {/* ── Onglet alertes ── */}
      {tab === "alertes" && (
        <section>
          {loading ? (
            <div className="surface p-5">
              <Spinner />
            </div>
          ) : (
            <AlertsPanel criteres={criteres} onChanged={loadCriteres} />
          )}
        </section>
      )}

      {/* ── Détail annonce ── */}
      <AnnonceDetailDialog
        open={detailAnnonce !== null}
        onClose={closeDetail}
        annonce={detailAnnonce}
        match={detailMatch}
        onChanged={() => {
          if (tab === "annonces") void loadAnnonces();
          if (tab === "matching") void loadMatchs();
        }}
      />
    </div>
  );
}

// ─── Ligne d'erreur ───────────────────────────────────────────────────────────

function ErrorLine({ msg }: { msg: string }) {
  return (
    <div className="surface flex items-center gap-2 p-4">
      <Badge color="red">{UI.common.error}</Badge>
      <Text>{msg}</Text>
    </div>
  );
}

// ─── Match list ───────────────────────────────────────────────────────────────

function MatchList({
  matchs,
  onFeedback,
  onOpenDetail,
}: {
  matchs: Match[];
  onFeedback: (id: string, signal: "up" | "down") => Promise<void>;
  onOpenDetail: (a: Annonce, m: Match) => void;
}) {
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
          <li key={m.id} className="flex flex-wrap items-start gap-4 py-5 sm:flex-nowrap">
            <ScoreRing score={m.score_match} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Strong className="text-base">{annonceTitle(a)}</Strong>
                <RecoBadge match={m} />
                {isGood && <Badge color="indigo">{UI.prospection.matchGoodLabel}</Badge>}
              </div>
              {metaParts.length > 0 && <Text className="mt-0.5">{metaParts.join(" · ")}</Text>}
              <div className="mt-3">
                <MatchReasons match={m} showNextAction />
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-44">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{UI.prospection.matchNextAction}</span>
              <Button color="indigo" className="!text-zinc-950" onClick={() => onOpenDetail(a, m)}>
                {UI.prospection.detailOpen}
              </Button>
              <div className="flex items-center gap-1">
                <Button plain aria-label={UI.prospection.feedbackLikeAria} onClick={() => onFeedback(m.id, "up")}>
                  <HandThumbUpIcon aria-hidden="true" className="size-5" />
                </Button>
                <Button plain aria-label={UI.prospection.feedbackDislikeAria} onClick={() => onFeedback(m.id, "down")}>
                  <HandThumbDownIcon aria-hidden="true" className="size-5" />
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2 py-12">
      <span className="size-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent dark:border-accent-400" aria-hidden="true" />
      <Text>{UI.prospection.loading}</Text>
    </div>
  );
}
