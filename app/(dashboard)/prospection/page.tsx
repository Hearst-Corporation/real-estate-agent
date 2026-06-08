"use client";
import { useEffect, useState } from "react";
import { UI } from "@/lib/ui-strings";
import { PageHeader, Card, PageStack } from "@/components/cockpit/primitives";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
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

// ─── Composant score ring ─────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const cls = scoreClass(score);
  return (
    <div className="prospection-score-ring" aria-label={`Score ${score}/100`}>
      <svg viewBox="0 0 64 64">
        <circle className="prospection-score-ring-track" cx="32" cy="32" r={radius} />
        <circle
          className={`prospection-score-ring-fill ${cls}`}
          cx="32"
          cy="32"
          r={radius}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className={`prospection-score-value ${cls}`}>{score}</div>
    </div>
  );
}

// ─── Empty state premium ──────────────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  text,
  steps,
  action,
}: {
  icon: string;
  title: string;
  text: string;
  steps?: string[];
  action?: React.ReactNode;
}) {
  return (
    <div className="prospection-empty">
      <div className="prospection-empty-icon" aria-hidden="true">{icon}</div>
      <p className="prospection-empty-title">{title}</p>
      <p className="prospection-empty-text">{text}</p>
      {steps && steps.length > 0 && (
        <ol className="prospection-empty-steps" aria-label={UI.prospection.emptyStepsAria}>
          {steps.map((s, i) => (
            <li key={i} className="prospection-empty-step">
              <span className="prospection-empty-step-num" aria-hidden="true">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
      {action}
    </div>
  );
}

// ─── Carte annonce visuelle ───────────────────────────────────────────────────

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
    <article className="prospection-annonce-card">
      <div className="prospection-annonce-photo">
        {photos[0] ? (
          <img src={photos[0]} alt={annonceTitle(annonce)} loading="lazy" />
        ) : (
          <div className="prospection-annonce-photo-placeholder" aria-hidden="true">
            🏠
          </div>
        )}
        <div className="prospection-annonce-badges">
          {isPap && (
            <span className="prospection-badge prospection-badge-pap">
              {UI.prospection.badgePap}
            </span>
          )}
          {!isPap && annonce.type_annonceur === "pro" && (
            <span className="prospection-badge prospection-badge-muted">
              {UI.prospection.badgePro}
            </span>
          )}
          {hasBaisse && (
            <span className="prospection-badge prospection-badge-warn">
              {UI.prospection.badgeBaissePrix}
            </span>
          )}
          {annonce.dpe_note && (
            <span className="prospection-badge prospection-badge-dpe">
              {UI.prospection.badgeDpe(annonce.dpe_note)}
            </span>
          )}
        </div>
      </div>

      <div className="prospection-annonce-body">
        <div className="prospection-annonce-title">{annonceTitle(annonce)}</div>
        {metaParts.length > 0 && (
          <div className="prospection-annonce-meta">{metaParts.join(" · ")}</div>
        )}

        {annonce.prix != null && (
          <div className="prospection-annonce-price-row">
            <span className="prospection-annonce-price">
              {UI.prospection.annoncePrix(annonce.prix)}
            </span>
            {annonce.prix_m2 != null && (
              <span className="prospection-annonce-price-m2">
                {UI.prospection.annoncePrixM2(Math.round(annonce.prix_m2))}
              </span>
            )}
          </div>
        )}

        <div className="prospection-annonce-footer">
          <div className="prospection-annonce-tags">
            {annonce.age_hours != null && (
              <span className="prospection-badge prospection-badge-muted">
                {UI.prospection.badgeAge(annonce.age_hours)}
              </span>
            )}
            {annonce.source_platform && (
              <span className="prospection-badge prospection-badge-muted">
                {annonce.source_platform}
              </span>
            )}
          </div>
          {annonce.url && (
            <a
              href={annonce.url}
              target="_blank"
              rel="noopener noreferrer"
              className="crm-link"
              style={{ fontSize: "var(--ct-fs-xs)", flexShrink: 0 }}
            >
              {UI.prospection.annonceVoir} →
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

  async function sendFeedback(matchId: string, signal: "like" | "dislike" | "contact" | "visite") {
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
  const acquereurColumns: Column<Critere>[] = [
    { key: "nom", header: UI.prospection.colNom, render: (c) => <strong>{c.nom}</strong> },
    { key: "budget", header: UI.prospection.colBudget, render: (c) => budgetLabel(c) },
    { key: "zones", header: UI.prospection.colZones, render: (c) => zonesLabel(c.zones) },
    { key: "contact", header: UI.prospection.colContact, render: (c) => c.telephone ?? "—" },
    {
      key: "criteres",
      header: UI.prospection.colCriteres,
      render: (c) => (
        <div className="prospection-acquereur-tags">
          {c.type_bien?.map((type) => (
            <span key={type} className="prospection-pill">{type}</span>
          ))}
          {c.surface_min ? (
            <span className="prospection-pill">{UI.prospection.annonceSurface(c.surface_min)} min</span>
          ) : null}
          {c.pieces_min ? (
            <span className="prospection-pill">{UI.prospection.annoncePieces(c.pieces_min)} min</span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <PageStack>
      <PageHeader
        kicker={UI.prospection.kicker}
        title={UI.prospection.title}
        action={
          <button type="button" className="ct-seg-btn primary" onClick={() => selectTab("criteres")}>
            {UI.prospection.newAcquereurBtn}
          </button>
        }
        nav={TABS.map((t) => (
          <button
            key={t}
            className={`ct-page-header-nav-item${tab === t ? " active" : ""}`}
            onClick={() => selectTab(t)}
          >
            {t === "acquereurs"
              ? UI.prospection.tabAcquereurs
              : t === "annonces"
              ? UI.prospection.annonces
              : t === "matching"
              ? UI.prospection.matching
              : UI.prospection.criteres}
          </button>
        ))}
        kpis={[
          { label: UI.prospection.kpiAcquereurs, value: String(criteres.length) },
          { label: UI.prospection.kpiMatchs, value: String(matchs.length) },
          { label: UI.prospection.kpiAnnonces, value: String(annonces.length) },
          {
            label: UI.prospection.kpiAlertes,
            value: String(criteres.filter((c) => c.alerte_email || c.alerte_whatsapp).length),
          },
        ]}
      />

      <Card variant="dense">
        {/* ── Onglet acquéreurs ── */}
        {tab === "acquereurs" && (
          <div className="prospection-list">
            {error && criteres.length > 0 ? (
              <p className="ct-error" style={{ padding: "var(--ct-space-md)" }}>{error}</p>
            ) : null}
            {loading ? (
              <Spinner />
            ) : criteres.length === 0 ? (
              <EmptyState
                icon="👤"
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
                    className="ct-seg-btn primary"
                    style={{ marginTop: "var(--ct-space-sm)" }}
                    onClick={() => selectTab("criteres")}
                  >
                    {UI.prospection.newCritere}
                  </button>
                }
              />
            ) : (
              <DataTable
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
            <div className="prospection-toolbar">
              <label className="prospection-filter">
                <input
                  type="checkbox"
                  checked={filterEligible}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFilterEligible(checked);
                    void loadAnnonces(checked);
                  }}
                />
                {UI.prospection.eligibleOnly}
              </label>
              <span className="prospection-count">
                {UI.prospection.annonceCount(annonces.length)}
              </span>
              <button type="button" className="ct-seg-btn prospection-refresh" onClick={() => loadAnnonces()}>
                {UI.prospection.refresh}
              </button>
            </div>

            {error && annonces.length > 0 ? (
              <p className="ct-error" style={{ padding: "var(--ct-space-md)" }}>{error}</p>
            ) : null}

            {loading ? (
              <Spinner />
            ) : annonces.length === 0 ? (
              <div className="prospection-grid">
                <EmptyState
                  icon="🔍"
                  title={UI.prospection.emptyAnnoncesTitle}
                  text={UI.prospection.emptyAnnoncesText}
                  steps={[
                    UI.prospection.emptyAnnoncesStep1,
                    UI.prospection.emptyAnnoncesStep2,
                    UI.prospection.emptyAnnoncesStep3,
                  ]}
                />
              </div>
            ) : (
              <div className="prospection-grid">
                {annonces.map((a) => (
                  <AnnonceCard key={a.id} annonce={a} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Onglet matching ── */}
        {tab === "matching" && (
          <div>
            <div
              style={{
                padding: "var(--ct-space-md)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--ct-space-md)",
              }}
            >
              <p className="prospection-hint">{UI.prospection.matchingHint}</p>
              <button
                type="button"
                className="ct-seg-btn prospection-refresh"
                onClick={() => loadMatchs()}
              >
                {UI.prospection.refresh}
              </button>
            </div>

            {error && matchs.length > 0 ? (
              <p className="ct-error" style={{ padding: "var(--ct-space-md)" }}>{error}</p>
            ) : null}

            {loading ? (
              <Spinner />
            ) : matchs.length === 0 ? (
              <div style={{ padding: "var(--ct-space-md)" }}>
                <EmptyState
                  icon="✨"
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
                      className="ct-seg-btn primary"
                      style={{ marginTop: "var(--ct-space-sm)" }}
                      onClick={() => selectTab("criteres")}
                    >
                      {UI.prospection.newCritere}
                    </button>
                  }
                />
              </div>
            ) : (
              <MatchList matchs={matchs} onFeedback={sendFeedback} />
            )}
          </div>
        )}

        {/* ── Onglet critères ── */}
        {tab === "criteres" && <CriteresPanel onChanged={loadCriteres} />}
      </Card>
    </PageStack>
  );
}

// ─── Match list ───────────────────────────────────────────────────────────────

function MatchList({
  matchs,
  onFeedback,
}: {
  matchs: Match[];
  onFeedback: (id: string, signal: "like" | "dislike" | "contact" | "visite") => Promise<void>;
}) {
  // Trier : bons matchs en premier
  const sorted = [...matchs].sort((a, b) => b.score_match - a.score_match);

  return (
    <div>
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
          <div key={m.id} className={`prospection-match-row${isGood ? " is-good" : ""}`}>
            <ScoreRing score={m.score_match} />

            <div className="prospection-match-body">
              <div className="prospection-match-title">
                {annonceTitle(a)}
                {isGood && (
                  <span
                    className="prospection-badge prospection-badge-success"
                    style={{ marginLeft: "var(--ct-space-xs)" }}
                  >
                    {UI.prospection.matchGoodLabel}
                  </span>
                )}
              </div>
              {metaParts.length > 0 && (
                <div className="prospection-match-meta">{metaParts.join(" · ")}</div>
              )}
            </div>

            <div className="prospection-match-actions">
              <button
                className="prospection-feedback-btn"
                aria-label={UI.prospection.feedbackLikeAria}
                onClick={() => onFeedback(m.id, "like")}
              >
                👍
              </button>
              <button
                className="prospection-feedback-btn"
                aria-label={UI.prospection.feedbackDislikeAria}
                onClick={() => onFeedback(m.id, "dislike")}
              >
                👎
              </button>
              <button
                className="ct-seg-btn primary"
                onClick={() => onFeedback(m.id, "contact")}
              >
                {UI.prospection.matchContactBtn}
              </button>
            </div>
          </div>
        );
      })}
    </div>
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

  const critereColumns: Column<Critere>[] = [
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
          onClick={() => deleteCritere(c.id)}
          style={{
            background: "none",
            border: "1px solid var(--ct-border)",
            borderRadius: "var(--ct-radius-sm)",
            padding: "4px 12px",
            cursor: "pointer",
            color: "var(--ct-text-danger)",
            fontSize: "var(--ct-fs-xs)",
          }}
        >
          {UI.prospection.delete}
        </button>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--ct-space-md)",
        }}
      >
        <span style={{ color: "var(--ct-text-muted)", fontSize: "var(--ct-fs-sm)" }}>
          {UI.prospection.criteresCount(criteres.length)}
        </span>
        <div className="ct-seg-track">
          <button className="ct-seg-btn" onClick={loadCriteres}>
            {UI.prospection.refresh}
          </button>
          <button className="ct-seg-btn primary" onClick={() => setShowForm((v) => !v)}>
            {UI.prospection.newCritere}
          </button>
        </div>
      </div>

      {showForm && (
        <div
          className="ct-card"
          style={{
            margin: "var(--ct-space-md)",
            padding: "var(--ct-space-md)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--ct-space-sm)",
          }}
        >
          <input
            className="ct-input"
            placeholder={UI.prospection.critereNamePlaceholder}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
          <input
            className="ct-input"
            placeholder={UI.prospection.critereZonesPlaceholder}
            value={zones}
            onChange={(e) => setZones(e.target.value)}
          />
          <input
            className="ct-input"
            placeholder={UI.prospection.budgetMaxPlaceholder}
            type="number"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
          />
          <input
            className="ct-input"
            placeholder={UI.prospection.surfaceMinPlaceholder}
            type="number"
            value={surfaceMin}
            onChange={(e) => setSurfaceMin(e.target.value)}
          />
          <button className="ct-seg-btn primary" onClick={save} disabled={saving}>
            {saving ? UI.prospection.saving : UI.prospection.save}
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
        {error ? (
          <p className="ct-error" style={{ padding: "var(--ct-space-md)" }}>{error}</p>
        ) : null}
        {loading ? (
          <Spinner />
        ) : criteres.length === 0 ? (
          <div style={{ padding: "var(--ct-space-md)" }}>
            <EmptyState
              icon="🎯"
              title={UI.prospection.emptyCriteresTitle}
              text={UI.prospection.emptyCriteresText}
              steps={[
                UI.prospection.emptyCriteresStep1,
                UI.prospection.emptyCriteresStep2,
                UI.prospection.emptyCriteresStep3,
              ]}
            />
          </div>
        ) : (
          <DataTable
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
    <div className="prospection-spinner">
      <span>{UI.prospection.loading}</span>
    </div>
  );
}
