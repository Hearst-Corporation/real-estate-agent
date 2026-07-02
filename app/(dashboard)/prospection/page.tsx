"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  UsersIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  BuildingOffice2Icon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { UI } from "@/lib/ui-strings";
import { PageSegmentTabs } from "@/components/cockpit/PageSegmentTabs";
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

const SCORE_TONE: Record<"is-good" | "is-ok" | "is-low", string> = {
  "is-good": "stroke-emerald-400 text-emerald-300",
  "is-ok": "stroke-amber-400 text-amber-300",
  "is-low": "stroke-slate-500 text-slate-400",
};

// ─── Badge (inline, ex-primitive) ─────────────────────────────────────────────

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-200">
      {children}
    </span>
  );
}

// ─── Composant score ring ─────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const cls = scoreClass(score);
  return (
    <div className="relative size-16 shrink-0" aria-label={`Score ${score}/100`}>
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={radius} className="fill-none stroke-white/10" strokeWidth="6" />
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

// ─── Empty state (TW+ feedback__empty-states/03-with-starting-points adapté) ───

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
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      <IconCmp aria-hidden="true" className="size-10 text-slate-500" />
      <p className="text-base font-semibold text-slate-100">{title}</p>
      <p className="max-w-md text-sm text-slate-400">{text}</p>
      {steps && steps.length > 0 && (
        <ol className="mt-2 flex flex-col gap-2 text-left" aria-label={UI.prospection.emptyStepsAria}>
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm text-slate-300">
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-xs font-semibold text-indigo-300"
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

// ─── Table (TW+ lists__tables/02-simple-in-card adapté, remplace DataTable) ────

type SimpleColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
};

function SimpleTable<T>({
  columns,
  rows,
  emptyLabel,
  getKey,
}: {
  columns: SimpleColumn<T>[];
  rows: T[];
  emptyLabel: string;
  getKey: (row: T) => string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 font-medium ${col.align === "right" ? "text-right tabular-nums" : ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row) => (
            <tr key={getKey(row)} className="transition-colors hover:bg-white/[0.03]">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2.5 text-slate-200 ${col.align === "right" ? "text-right tabular-nums" : ""}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Carte annonce (TW+ lists__grid-lists/06-images-with-details adapté) ──────

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
    <article className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20">
      <div className="relative aspect-[4/3] w-full bg-white/[0.02]">
        {photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photos[0]} alt={annonceTitle(annonce)} loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-slate-600" aria-hidden="true">
            <BuildingOffice2Icon className="size-12" />
          </div>
        )}
        <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1.5">
          {isPap && (
            <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs font-medium text-emerald-300 backdrop-blur-sm">
              {UI.prospection.badgePap}
            </span>
          )}
          {!isPap && annonce.type_annonceur === "pro" && (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-xs font-medium text-slate-200 backdrop-blur-sm">
              {UI.prospection.badgePro}
            </span>
          )}
          {hasBaisse && (
            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-300 backdrop-blur-sm">
              {UI.prospection.badgeBaissePrix}
            </span>
          )}
          {annonce.dpe_note && (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-xs font-medium text-slate-200 backdrop-blur-sm">
              {UI.prospection.badgeDpe(annonce.dpe_note)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="text-sm font-semibold text-slate-100">{annonceTitle(annonce)}</div>
        {metaParts.length > 0 && (
          <div className="text-xs text-slate-400">{metaParts.join(" · ")}</div>
        )}

        {annonce.prix != null && (
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-white">{UI.prospection.annoncePrix(annonce.prix)}</span>
            {annonce.prix_m2 != null && (
              <span className="text-xs text-slate-500">
                {UI.prospection.annoncePrixM2(Math.round(annonce.prix_m2))}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {annonce.age_hours != null && (
              <Badge>{UI.prospection.badgeAge(annonce.age_hours)}</Badge>
            )}
            {annonce.source_platform && <Badge>{annonce.source_platform}</Badge>}
          </div>
          {annonce.url && (
            <a
              href={annonce.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-300 hover:text-indigo-200"
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

  // ── Colonnes acquéreurs ──────────────────────────────────────────────────
  const acquereurColumns: SimpleColumn<Critere>[] = [
    { key: "nom", header: UI.prospection.colNom, render: (c) => <strong>{c.nom}</strong> },
    { key: "budget", header: UI.prospection.colBudget, render: (c) => budgetLabel(c) },
    { key: "zones", header: UI.prospection.colZones, render: (c) => zonesLabel(c.zones) },
    { key: "contact", header: UI.prospection.colContact, render: (c) => c.telephone ?? "—" },
    {
      key: "criteres",
      header: UI.prospection.colCriteres,
      render: (c) => (
        <div className="flex flex-wrap gap-1.5">
          {c.type_bien?.map((type) => <Badge key={type}>{type}</Badge>)}
          {c.surface_min ? (
            <Badge>{UI.prospection.annonceSurface(c.surface_min)} min</Badge>
          ) : null}
          {c.pieces_min ? (
            <Badge>{UI.prospection.annoncePieces(c.pieces_min)} min</Badge>
          ) : null}
        </div>
      ),
    },
  ];

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
      {/* ── Header (TW+ page-headings/08-with-filters-and-action adapté sombre) ── */}
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
              {UI.prospection.kicker}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white">{UI.prospection.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ScrapeCustomModal
              onDone={() => {
                setTab("matching");
                void loadAnnonces();
                void loadMatchs();
              }}
            />
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
              onClick={() => selectTab("criteres")}
            >
              {UI.prospection.newAcquereurBtn}
            </button>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1 border-b border-white/10 pb-2">
          <PageSegmentTabs
            tabs={TABS.map((t) => ({
              id: t,
              label:
                t === "acquereurs"
                  ? UI.prospection.tabAcquereurs
                  : t === "annonces"
                  ? UI.prospection.annonces
                  : t === "matching"
                  ? UI.prospection.matching
                  : UI.prospection.criteres,
            }))}
            active={tab}
            onSelect={selectTab}
          />
        </nav>
      </div>

      {/* ── Stats (TW+ data-display__stats/03-simple-in-cards adapté sombre) ── */}
      <dl className="grid grid-cols-2 gap-4 @2xl:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.name}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 shadow-lg shadow-black/20"
          >
            <dt className="truncate text-sm font-medium text-slate-400">{item.name}</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-white">{item.value}</dd>
          </div>
        ))}
      </dl>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
        {/* ── Onglet acquéreurs ── */}
        {tab === "acquereurs" && (
          <div>
            {error && criteres.length > 0 ? (
              <p className="p-4 text-sm text-red-400">{error}</p>
            ) : null}
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
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
                    onClick={() => selectTab("criteres")}
                  >
                    {UI.prospection.newCritere}
                  </button>
                }
              />
            ) : (
              <SimpleTable
                columns={acquereurColumns}
                rows={criteres}
                emptyLabel={error ?? UI.prospection.emptyCriteres}
                getKey={(c) => c.id}
              />
            )}
          </div>
        )}

        {/* ── Onglet annonces ── */}
        {tab === "annonces" && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={filterEligible}
                  className="size-4 rounded border-white/20 bg-white/[0.04] text-indigo-500 focus:ring-indigo-400/50"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFilterEligible(checked);
                    void loadAnnonces(checked);
                  }}
                />
                {UI.prospection.eligibleOnly}
              </label>
              <span className="text-sm text-slate-500">
                {UI.prospection.annonceCount(annonces.length)}
              </span>
              <button
                type="button"
                className="ml-auto inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
                onClick={() => loadAnnonces()}
              >
                {UI.prospection.refresh}
              </button>
            </div>

            {error && annonces.length > 0 ? (
              <p className="p-4 text-sm text-red-400">{error}</p>
            ) : null}

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
              <ul
                role="list"
                className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3"
              >
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
              <p className="text-sm text-slate-400">{UI.prospection.matchingHint}</p>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
                onClick={() => loadMatchs()}
              >
                {UI.prospection.refresh}
              </button>
            </div>

            {error && matchs.length > 0 ? (
              <p className="p-4 text-sm text-red-400">{error}</p>
            ) : null}

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
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
                    onClick={() => selectTab("criteres")}
                  >
                    {UI.prospection.newCritere}
                  </button>
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

// ─── Match list (TW+ lists__stacked-lists/01-simple adapté sombre) ────────────

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
    <ul role="list" className="divide-y divide-white/5">
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
          <li
            key={m.id}
            className={`flex flex-wrap items-center gap-4 py-4 ${isGood ? "bg-emerald-400/[0.03]" : ""}`}
          >
            <ScoreRing score={m.score_match} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-100">
                {annonceTitle(a)}
                {isGood && <Badge>{UI.prospection.matchGoodLabel}</Badge>}
              </div>
              {metaParts.length > 0 && (
                <div className="mt-0.5 text-xs text-slate-400">{metaParts.join(" · ")}</div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-sm transition-colors hover:bg-white/[0.08]"
                aria-label={UI.prospection.feedbackLikeAria}
                onClick={() => onFeedback(m.id, "up")}
              >
                👍
              </button>
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-sm transition-colors hover:bg-white/[0.08]"
                aria-label={UI.prospection.feedbackDislikeAria}
                onClick={() => onFeedback(m.id, "down")}
              >
                👎
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
                title={UI.prospection.contactSoon}
                onClick={() => onContactSoon()}
              >
                {UI.prospection.matchContactBtn}
              </button>
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

  const critereColumns: SimpleColumn<Critere>[] = [
    { key: "nom", header: UI.prospection.colNom, render: (c) => <strong>{c.nom}</strong> },
    { key: "zones", header: UI.prospection.colZones, render: (c) => zonesLabel(c.zones) },
    {
      key: "budget",
      header: UI.prospection.colBudgetMax,
      render: (c) =>
        c.budget_max ? `${Number(c.budget_max).toLocaleString("fr-FR")} €` : "—",
    },
    {
      key: "action",
      header: UI.prospection.colAction,
      align: "right",
      render: (c) => (
        <button
          type="button"
          className="text-sm font-medium text-red-400 hover:text-red-300"
          onClick={() => deleteCritere(c.id)}
        >
          {UI.prospection.delete}
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-500">
          {UI.prospection.criteresCount(criteres.length)}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
            onClick={loadCriteres}
          >
            {UI.prospection.refresh}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
            onClick={() => setShowForm((v) => !v)}
          >
            {UI.prospection.newCritere}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none"
            placeholder={UI.prospection.critereNamePlaceholder}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none"
            placeholder={UI.prospection.critereZonesPlaceholder}
            value={zones}
            onChange={(e) => setZones(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none"
            placeholder={UI.prospection.budgetMaxPlaceholder}
            type="number"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none"
            placeholder={UI.prospection.surfaceMinPlaceholder}
            type="number"
            value={surfaceMin}
            onChange={(e) => setSurfaceMin(e.target.value)}
          />
          <button
            type="button"
            className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={save}
            disabled={saving}
          >
            {saving ? UI.prospection.saving : UI.prospection.save}
          </button>
        </div>
      )}

      <div>
        {error ? <p className="p-4 text-sm text-red-400">{error}</p> : null}
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
          <SimpleTable
            columns={critereColumns}
            rows={criteres}
            emptyLabel={UI.prospection.emptyCriteres}
            getKey={(c) => c.id}
          />
        )}
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <span
        className="size-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent"
        aria-hidden="true"
      />
      <span>{UI.prospection.loading}</span>
    </div>
  );
}
