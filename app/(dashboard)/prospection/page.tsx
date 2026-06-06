"use client";
import { useEffect, useState } from "react";
import { UI } from "@/lib/ui-strings";

interface Annonce {
  id: string;
  type_bien: string;
  titre?: string;
  prix?: number;
  surface?: number;
  pieces?: number;
  code_postal?: string;
  ville?: string;
  url?: string;
  photos?: string[];
  is_pap: boolean;
  score_mandat?: number;
  mandat_eligible?: boolean;
}

interface Match {
  id: string;
  score_match: number;
  alerte_envoyee: boolean;
  created_at: string;
  annonce: Annonce;
}

type Tab = "annonces" | "matching" | "criteres";

export default function ProspectionPage() {
  const [tab, setTab] = useState<Tab>("annonces");
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [matchs, setMatchs] = useState<Match[]>([]);
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

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    if (nextTab === "annonces" && annonces.length === 0) void loadAnnonces();
    if (nextTab === "matching" && matchs.length === 0) void loadMatchs();
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialAnnonces() {
      try {
        const res = await fetch("/api/prospection/annonces");
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Erreur HTTP ${res.status}`);
          return;
        }
        if (json.degraded) setError(UI.prospection.degradedAnnonces);
        setAnnonces(json.data ?? []);
      } catch {
        if (!cancelled) setError(UI.prospection.loadAnnoncesError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialAnnonces();
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

  return (
    <div className="prospection-page">
      <div className="prospection-header">
        <h1 className="ct-title prospection-title">{UI.prospection.title}</h1>
        <div className="ct-seg-track">
          {(["annonces","matching","criteres"] as Tab[]).map(t => (
            <button key={t} className={`ct-seg-btn${tab === t ? " active" : ""}`} onClick={() => selectTab(t)}>
              {t === "annonces" ? UI.prospection.annonces : t === "matching" ? UI.prospection.matching : UI.prospection.criteres}
            </button>
          ))}
        </div>
      </div>

      {tab === "annonces" && (
        <div>
          <div className="prospection-toolbar">
            <label className="prospection-filter">
              <input
                type="checkbox"
                checked={filterEligible}
                onChange={e => {
                  const checked = e.target.checked;
                  setFilterEligible(checked);
                  void loadAnnonces(checked);
                }}
              />
              {UI.prospection.eligibleOnly}
            </label>
            <span className="prospection-count">{annonces.length} annonces</span>
            <button type="button" className="ct-seg-btn" onClick={() => loadAnnonces()}>
              {UI.prospection.refresh}
            </button>
          </div>
          {error && annonces.length > 0 ? <p className="ct-error">{error}</p> : null}
          {loading ? <Spinner /> : (
            <div className="prospection-grid">
              {annonces.map(a => <AnnonceCard key={a.id} annonce={a} />)}
              {!annonces.length && (
                <EmptyState
                  title={error ?? UI.prospection.emptyAnnonces}
                  text="Vérifiez l'ingestion ou les providers configurés."
                />
              )}
            </div>
          )}
        </div>
      )}

      {tab === "matching" && (
        <div>
          <p className="prospection-hint">
            {UI.prospection.matchingHint}
          </p>
          <button type="button" className="ct-seg-btn prospection-refresh" onClick={() => loadMatchs()}>
            {UI.prospection.refresh}
          </button>
          {error && matchs.length > 0 ? <p className="ct-error">{error}</p> : null}
          {loading ? <Spinner /> : (
            <div className="prospection-list">
              {matchs.map(m => (
                <MatchCard key={m.id} match={m} onFeedback={(signal) => sendFeedback(m.id, signal)} />
              ))}
              {!matchs.length && <EmptyState title={error ?? UI.prospection.emptyMatchs} />}
            </div>
          )}
        </div>
      )}

      {tab === "criteres" && <CriteresPanel />}
    </div>
  );
}

function AnnonceCard({ annonce: a }: { annonce: Annonce }) {
  const prix = a.prix ? `${Math.round(a.prix / 1000)}k€` : "NC";
  return (
    <div className="ct-card prospection-card">
      {a.mandat_eligible && (
        <span className="prospection-badge">
          Mandat {a.score_mandat}/100
        </span>
      )}
      <div className="prospection-card-title">
        {a.titre ?? a.type_bien}
      </div>
      <div className="prospection-card-meta">
        {[a.surface && `${a.surface}m²`, a.pieces && `${a.pieces}p`, a.ville ?? a.code_postal].filter(Boolean).join(" · ")}
      </div>
      <div className="prospection-price">{prix}</div>
      {a.is_pap && <span className="prospection-pap">PAP</span>}
      {a.url && (
        <a href={a.url} target="_blank" rel="noopener" className="prospection-link">
          Voir l&apos;annonce →
        </a>
      )}
    </div>
  );
}

function MatchCard({ match: m, onFeedback }: { match: Match; onFeedback: (s: "like"|"dislike"|"contact"|"visite") => void }) {
  const a = m.annonce;
  const prix = a.prix ? `${Math.round(a.prix / 1000)}k€` : "NC";
  return (
    <div className="ct-card prospection-match">
      <div className={`prospection-score${m.score_match >= 70 ? " is-good" : ""}`}>
        {m.score_match}
      </div>
      <div className="prospection-match-body">
        <div className="prospection-card-title">{a.titre ?? a.type_bien}</div>
        <div className="prospection-card-meta">
          {[a.surface && `${a.surface}m²`, a.pieces && `${a.pieces}p`, a.ville ?? a.code_postal, prix].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="prospection-feedback">
        <FeedbackBtn emoji="👍" onClick={() => onFeedback("like")} />
        <FeedbackBtn emoji="👎" onClick={() => onFeedback("dislike")} />
        <FeedbackBtn emoji="📞" onClick={() => onFeedback("contact")} />
      </div>
    </div>
  );
}

function FeedbackBtn({ emoji, onClick }: { emoji: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="prospection-feedback-btn">
      {emoji}
    </button>
  );
}

function CriteresPanel() {
  const [criteres, setCriteres] = useState<Record<string, unknown>[]>([]);
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
          zones: zones.split(",").map(z => z.trim()).filter(Boolean),
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
      setShowForm(false);
      setNom(""); setZones(""); setBudgetMax(""); setSurfaceMin("");
    } catch {
      setError(UI.prospection.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCritere(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/prospection/criteres?id=${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      setCriteres(c => c.filter(x => x.id !== id));
    } catch {
      setError(UI.prospection.deleteError);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--ct-space-md)" }}>
        <span style={{ color: "var(--ct-text-muted)", fontSize: "var(--ct-fs-sm)" }}>{UI.prospection.criteresCount(criteres.length)}</span>
        <div className="ct-seg-track">
          <button className="ct-seg-btn" onClick={loadCriteres}>{UI.prospection.refresh}</button>
          <button className="ct-seg-btn primary" onClick={() => setShowForm(v => !v)}>{UI.prospection.newCritere}</button>
        </div>
      </div>
      {showForm && (
        <div className="ct-card" style={{ padding: "var(--ct-space-md)", marginBottom: "var(--ct-space-md)", display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
          <input className="ct-input" placeholder={UI.prospection.critereNamePlaceholder} value={nom} onChange={e => setNom(e.target.value)} />
          <input className="ct-input" placeholder={UI.prospection.critereZonesPlaceholder} value={zones} onChange={e => setZones(e.target.value)} />
          <input className="ct-input" placeholder={UI.prospection.budgetMaxPlaceholder} type="number" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} />
          <input className="ct-input" placeholder={UI.prospection.surfaceMinPlaceholder} type="number" value={surfaceMin} onChange={e => setSurfaceMin(e.target.value)} />
          <button className="ct-seg-btn primary" onClick={save} disabled={saving}>{saving ? UI.prospection.saving : UI.prospection.save}</button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
        {error ? <p className="ct-error">{error}</p> : null}
        {loading ? <Spinner /> : null}
        {criteres.map(c => (
          <div key={String(c.id)} className="ct-card" style={{ padding: "var(--ct-space-md)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--ct-text-strong)" }}>{String(c.nom)}</div>
              <div style={{ color: "var(--ct-text-muted)", fontSize: "var(--ct-fs-xs)" }}>
                Zones : {Array.isArray(c.zones) ? c.zones.join(", ") : "—"}
                {c.budget_max ? ` · Budget max : ${Number(c.budget_max).toLocaleString("fr-FR")} €` : ""}
              </div>
            </div>
            <button onClick={() => deleteCritere(String(c.id))} style={{ background: "none", border: "1px solid var(--ct-border)", borderRadius: "var(--ct-radius-sm)", padding: "4px 12px", cursor: "pointer", color: "var(--ct-text-danger)", fontSize: "var(--ct-fs-xs)" }}>
              {UI.prospection.delete}
            </button>
          </div>
        ))}
        {!loading && !criteres.length && <EmptyState title={UI.prospection.emptyCriteres} />}
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="prospection-spinner">Chargement…</div>;
}
function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="prospection-empty">
      <p className="prospection-empty-title">{title}</p>
      {text ? <p className="prospection-empty-text">{text}</p> : null}
    </div>
  );
}
