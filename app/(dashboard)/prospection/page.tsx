"use client";
import { useEffect, useState } from "react";
import {
  UsersIcon,
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
import { Field, Label, FieldGroup } from "@/components/ui/fieldset";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "@/components/ui/table";
import { Text, Strong } from "@/components/ui/text";
import { ScrapeCustomModal } from "./_components/ScrapeCustomModal";
import { AnnonceDetailDialog } from "./_components/AnnonceDetailDialog";
import { RecoBadge, MatchReasons } from "./_components/MatchReasons";
import { matchReco } from "./_components/reco";
import type { Annonce, Match } from "./_components/types";
import { MATCH_SCORE_ALERT } from "@/lib/prospection/types";

// ─── Interfaces API ────────────────────────────────────────────────────────────
// Annonce / Match : voir ./_components/types.ts (partagés avec le détail).

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
  if (Array.isArray(zones)) {
    return zones
      .map((z) => (typeof z === "string" ? z : (z as { label?: string; ville?: string; cp?: string })?.label ?? (z as { ville?: string })?.ville ?? (z as { cp?: string })?.cp ?? ""))
      .filter(Boolean)
      .join(", ") || "—";
  }
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
  "is-good": "stroke-accent-400 text-accent-500 dark:text-accent-400",
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

// ─── Carte annonce (grille + primitives) ──────────────────────────────────────

function AnnonceCard({
  annonce,
  onOpenDetail,
}: {
  annonce: Annonce;
  onOpenDetail: (a: Annonce) => void;
}) {
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

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge color="zinc">{UI.prospection.detailProviderTag}</Badge>
            {annonce.age_hours != null && <Badge color="zinc">{UI.prospection.badgeAge(annonce.age_hours)}</Badge>}
            {(annonce.source_platform ?? annonce.source) && (
              <Badge color="zinc">{annonce.source_platform ?? annonce.source}</Badge>
            )}
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
  // Détail annonce (ouvert depuis une card annonce OU une ligne de match).
  const [detailAnnonce, setDetailAnnonce] = useState<Annonce | null>(null);
  const [detailMatch, setDetailMatch] = useState<Match | undefined>(undefined);
  // État du formulaire de création de critère, remonté au parent : les CTA de création
  // (« Nouvel acquéreur », empty states) basculent sur l'onglet Critères ET ouvrent
  // directement le formulaire — au lieu de juste changer d'onglet en laissant
  // l'utilisateur re-cliquer « + Nouveau critère ».
  const [criteresFormOpen, setCriteresFormOpen] = useState(false);

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

  // CTA « créer » : va sur l'onglet Critères ET ouvre directement le formulaire.
  function openNewCritere() {
    setCriteresFormOpen(true);
    selectTab("criteres");
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

  // Priorité haute dérivée du même seuil partagé que le moteur (source unique).
  const highPriorityCount = matchs.filter((m) => matchReco(m) === "high_priority").length;

  const stats = [
    { name: UI.prospection.kpiAcquereurs, value: String(criteres.length) },
    { name: UI.prospection.kpiMatchs, value: String(matchs.length) },
    { name: UI.prospection.kpiHighPriority, value: String(highPriorityCount) },
    { name: UI.prospection.kpiAnnonces, value: String(annonces.length) },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12 @container">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent-500 dark:text-accent-400">
              {UI.prospection.kicker}
            </p>
            <Heading className="font-titre">{UI.prospection.title}</Heading>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ScrapeCustomModal
              onDone={() => {
                setTab("matching");
                void loadAnnonces();
                void loadMatchs();
              }}
            />
            <Button outline onClick={openNewCritere}>
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
              className={tab === tItem ? "!text-accent-500 dark:!text-accent-400" : undefined}
            >
              {tabLabel(tItem)}
            </Button>
          ))}
        </nav>
      </div>

      {/* ── Stats (grille KPI + primitives) ── */}
      <dl className="grid grid-cols-2 gap-4 @2xl:grid-cols-4">
        {stats.map((item) => (
          <div key={item.name} className="surface p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {item.name}
            </dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="surface p-5">
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
                  <Button color="indigo" className="mt-2 !text-zinc-950" onClick={openNewCritere}>
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
                    <AnnonceCard annonce={a} onOpenDetail={(x) => openAnnonceDetail(x)} />
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
                  <Button color="indigo" className="mt-2 !text-zinc-950" onClick={openNewCritere}>
                    {UI.prospection.newCritere}
                  </Button>
                }
              />
            ) : (
              <MatchList
                matchs={matchs}
                onFeedback={sendFeedback}
                onOpenDetail={(a, m) => openAnnonceDetail(a, m)}
              />
            )}
          </div>
        )}

        {/* ── Onglet critères ── */}
        {tab === "criteres" && (
          <CriteresPanel
            onChanged={loadCriteres}
            formOpen={criteresFormOpen}
            onFormOpenChange={setCriteresFormOpen}
          />
        )}
      </section>

      {/* ── Détail annonce enrichi + actions CRM/contact/optout ── */}
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
  onOpenDetail,
}: {
  matchs: Match[];
  onFeedback: (id: string, signal: "up" | "down") => Promise<void>;
  onOpenDetail: (a: Annonce, m: Match) => void;
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
          <li key={m.id} className="flex flex-wrap items-start gap-4 py-5 sm:flex-nowrap">
            <ScoreRing score={m.score_match} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Strong className="text-base">{annonceTitle(a)}</Strong>
                <RecoBadge match={m} />
                {isGood && <Badge color="indigo">{UI.prospection.matchGoodLabel}</Badge>}
              </div>
              {metaParts.length > 0 && <Text className="mt-0.5">{metaParts.join(" · ")}</Text>}
              {/* Pourquoi ce match : facteurs de score + explain (si dispo). */}
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {UI.prospection.reasonsWhy}
                </p>
                <div className="mt-1.5">
                  <MatchReasons match={m} />
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-44">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {UI.prospection.matchNextAction}
              </span>
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

// ─── Panel critères ───────────────────────────────────────────────────────────

function CriteresPanel({
  onChanged,
  formOpen,
  onFormOpenChange,
}: {
  onChanged: () => Promise<void>;
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
}) {
  const [criteres, setCriteres] = useState<Critere[]>([]);
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
        setError(json.detail ?? json.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      await loadCriteres();
      await onChanged();
      onFormOpenChange(false);
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
          <Button color="indigo" className="!text-zinc-950" onClick={() => onFormOpenChange(!formOpen)}>
            {UI.prospection.newCritere}
          </Button>
        </div>
      </div>

      {formOpen && (
        <div className="surface mb-4 p-4">
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
            <Button color="indigo" className="w-fit !text-zinc-950" onClick={save} disabled={saving}>
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
        className="size-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent dark:border-accent-400"
        aria-hidden="true"
      />
      <Text>{UI.prospection.loading}</Text>
    </div>
  );
}
