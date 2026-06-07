"use client";
import { useEffect, useState } from "react";
import { UI } from "@/lib/ui-strings";
import { PageHeader, Card, PageStack } from "@/components/cockpit/primitives";
import { DataTable, type Column } from "@/components/cockpit/DataTable";

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
}

interface Match {
  id: string;
  score_match: number;
  alerte_envoyee: boolean;
  created_at: string;
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

  const acquereurColumns: Column<Critere>[] = [
    { key: "nom", header: "Nom", render: (c) => <strong>{c.nom}</strong> },
    { key: "budget", header: "Budget", render: (c) => budgetLabel(c) },
    { key: "zones", header: "Zones", render: (c) => zonesLabel(c.zones) },
    { key: "contact", header: "Contact", render: (c) => c.telephone ?? "—" },
    {
      key: "criteres",
      header: "Critères",
      render: (c) => (
        <div className="prospection-acquereur-tags" style={{ display: "flex", gap: "var(--ct-space-2xs)", flexWrap: "wrap" }}>
          {c.type_bien?.map((type) => <span key={type} className="prospection-pill" style={{ fontSize: "var(--ct-fs-2xs)", padding: "2px 6px", borderRadius: "var(--ct-radius-xs)", background: "var(--ct-surface-hover)" }}>{type}</span>)}
          {c.surface_min ? <span className="prospection-pill" style={{ fontSize: "var(--ct-fs-2xs)", padding: "2px 6px", borderRadius: "var(--ct-radius-xs)", background: "var(--ct-surface-hover)" }}>{c.surface_min} m² min</span> : null}
          {c.pieces_min ? <span className="prospection-pill" style={{ fontSize: "var(--ct-fs-2xs)", padding: "2px 6px", borderRadius: "var(--ct-radius-xs)", background: "var(--ct-surface-hover)" }}>{c.pieces_min} p min</span> : null}
        </div>
      ),
    },
  ];

  const annonceColumns: Column<Annonce>[] = [
    {
      key: "titre",
      header: "Annonce",
      render: (a) => (
        <div>
          <div style={{ fontWeight: 500 }}>{a.titre ?? a.type_bien}</div>
          <div className="ct-subtext">
            {[a.surface && `${a.surface}m²`, a.pieces && `${a.pieces}p`, a.ville ?? a.code_postal].filter(Boolean).join(" · ")}
          </div>
        </div>
      ),
    },
    { key: "prix", header: "Prix", render: (a) => a.prix ? `${Math.round(a.prix / 1000)}k€` : "NC" },
    {
      key: "tags",
      header: "Tags",
      render: (a) => (
        <div style={{ display: "flex", gap: "var(--ct-space-2xs)" }}>
          {a.is_pap && <span className="prospection-pap" style={{ fontSize: "var(--ct-fs-2xs)", padding: "2px 6px", borderRadius: "var(--ct-radius-xs)", background: "var(--ct-surface-accent)", color: "var(--ct-text-accent)" }}>PAP</span>}
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (a) => a.url ? <a href={a.url} target="_blank" rel="noopener" className="crm-link">Voir →</a> : "—",
    },
  ];

  const matchColumns: Column<Match>[] = [
    {
      key: "score",
      header: "Score",
      render: (m) => (
        <div className={`prospection-score${m.score_match >= 70 ? " is-good" : ""}`} style={{ fontWeight: 700, color: m.score_match >= 70 ? "var(--ct-text-success)" : "inherit" }}>
          {m.score_match}
        </div>
      ),
    },
    {
      key: "annonce",
      header: "Annonce",
      render: (m) => {
        const a = m.annonce;
        const prix = a.prix ? `${Math.round(a.prix / 1000)}k€` : "NC";
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{a.titre ?? a.type_bien}</div>
            <div className="ct-subtext">
              {[a.surface && `${a.surface}m²`, a.pieces && `${a.pieces}p`, a.ville ?? a.code_postal, prix].filter(Boolean).join(" · ")}
            </div>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (m) => (
        <div className="prospection-match-actions" style={{ display: "flex", gap: "var(--ct-space-xs)", justifyContent: "flex-end" }}>
          <button className="ct-seg-btn" onClick={() => sendFeedback(m.id, "like")}>👍</button>
          <button className="ct-seg-btn" onClick={() => sendFeedback(m.id, "dislike")}>👎</button>
          <button className="ct-seg-btn primary" onClick={() => sendFeedback(m.id, "contact")}>Contacter</button>
        </div>
      ),
    },
  ];

  return (
    <PageStack>
      <PageHeader
        kicker="BienCible import"
        title="Acquéreurs"
        action={
          <button type="button" className="ct-seg-btn primary" onClick={() => selectTab("criteres")}>
            + Nouvel acquéreur
          </button>
        }
        nav={TABS.map(t => (
          <button key={t} className={`ct-page-header-nav-item${tab === t ? " active" : ""}`} onClick={() => selectTab(t)}>
            {t === "acquereurs" ? "Acquéreurs" : t === "annonces" ? UI.prospection.annonces : t === "matching" ? UI.prospection.matching : UI.prospection.criteres}
          </button>
        ))}
        kpis={[
          { label: "Acquéreurs", value: String(criteres.length) },
          { label: "Matchs", value: String(matchs.length) },
          { label: "Annonces", value: String(annonces.length) },
          { label: "Alertes", value: String(criteres.filter(c => c.alerte_email || c.alerte_whatsapp).length) },
        ]}
      />

      <div className="ct-viz-row">
        <div>
          <Card title="Aperçu" variant="chart">
            <p className="ct-placeholder">Aperçu de la prospection.</p>
          </Card>
        </div>
        <div>
          <Card title="Alertes" variant="chart">
            <p className="ct-placeholder">Aucune alerte récente.</p>
          </Card>
        </div>
      </div>

      <Card variant="dense">
        {tab === "acquereurs" && (
          <div className="prospection-list">
            {error && criteres.length > 0 ? <p className="ct-error" style={{ padding: "var(--ct-space-md)" }}>{error}</p> : null}
            {loading ? <Spinner /> : (
              <DataTable
                columns={acquereurColumns}
                rows={criteres}
                emptyLabel={error ?? "Aucun acquéreur importé. Importez vos données BienCible ou créez un profil acquéreur."}
                getKey={(c) => c.id}
              />
            )}
          </div>
        )}

        {tab === "annonces" && (
          <div>
            <div className="prospection-toolbar" style={{ padding: "var(--ct-space-md)" }}>
              <label className="prospection-filter" style={{ marginRight: "var(--ct-space-md)" }}>
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
              <span className="prospection-count" style={{ marginRight: "var(--ct-space-md)" }}>{annonces.length} annonces</span>
              <button type="button" className="ct-seg-btn" onClick={() => loadAnnonces()}>
                {UI.prospection.refresh}
              </button>
            </div>
            {error && annonces.length > 0 ? <p className="ct-error" style={{ padding: "var(--ct-space-md)" }}>{error}</p> : null}
            {loading ? <Spinner /> : (
              <DataTable
                columns={annonceColumns}
                rows={annonces}
                emptyLabel={error ?? UI.prospection.emptyAnnonces}
                getKey={(a) => a.id}
              />
            )}
          </div>
        )}

        {tab === "matching" && (
          <div>
            <div style={{ padding: "var(--ct-space-md)", display: "flex", justifyContent: "space-between" }}>
              <p className="prospection-hint">
                {UI.prospection.matchingHint}
              </p>
              <button type="button" className="ct-seg-btn prospection-refresh" onClick={() => loadMatchs()}>
                {UI.prospection.refresh}
              </button>
            </div>
            {error && matchs.length > 0 ? <p className="ct-error" style={{ padding: "var(--ct-space-md)" }}>{error}</p> : null}
            {loading ? <Spinner /> : (
              <DataTable
                columns={matchColumns}
                rows={matchs}
                emptyLabel={error ?? UI.prospection.emptyMatchs}
                getKey={(m) => m.id}
              />
            )}
          </div>
        )}

        {tab === "criteres" && <CriteresPanel onChanged={loadCriteres} />}
      </Card>
    </PageStack>
  );
}

function zonesLabel(zones: unknown): string {
  if (Array.isArray(zones)) return zones.join(", ");
  if (typeof zones === "string") return zones;
  return "—";
}

function budgetLabel(critere: Critere): string {
  const min = critere.budget_min ? `${Number(critere.budget_min).toLocaleString("fr-FR")} €` : null;
  const max = critere.budget_max ? `${Number(critere.budget_max).toLocaleString("fr-FR")} €` : null;
  if (min && max) return `${min} - ${max}`;
  return max ?? min ?? "Budget NC";
}


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
      await onChanged();
      setShowForm(false);
      setNom(""); setZones(""); setBudgetMax(""); setSurfaceMin("");
    } catch {
      setError(UI.prospection.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCritere(id: string) {
    const critere = criteres.find(c => c.id === id);
    if (!confirm(`${UI.prospection.delete} « ${critere?.nom ?? id} » ?`)) return;
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

  const critereColumns: Column<Critere>[] = [
    { key: "nom", header: "Nom", render: (c) => <strong>{c.nom}</strong> },
    { key: "zones", header: "Zones", render: (c) => zonesLabel(c.zones) },
    { key: "budget", header: "Budget Max", render: (c) => c.budget_max ? `${Number(c.budget_max).toLocaleString("fr-FR")} €` : "—" },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (c) => (
        <button onClick={() => deleteCritere(c.id)} style={{ background: "none", border: "1px solid var(--ct-border)", borderRadius: "var(--ct-radius-sm)", padding: "4px 12px", cursor: "pointer", color: "var(--ct-text-danger)", fontSize: "var(--ct-fs-xs)" }}>
          {UI.prospection.delete}
        </button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--ct-space-md)" }}>
        <span style={{ color: "var(--ct-text-muted)", fontSize: "var(--ct-fs-sm)" }}>{UI.prospection.criteresCount(criteres.length)}</span>
        <div className="ct-seg-track">
          <button className="ct-seg-btn" onClick={loadCriteres}>{UI.prospection.refresh}</button>
          <button className="ct-seg-btn primary" onClick={() => setShowForm(v => !v)}>{UI.prospection.newCritere}</button>
        </div>
      </div>
      {showForm && (
        <div className="ct-card" style={{ margin: "var(--ct-space-md)", padding: "var(--ct-space-md)", display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
          <input className="ct-input" placeholder={UI.prospection.critereNamePlaceholder} value={nom} onChange={e => setNom(e.target.value)} />
          <input className="ct-input" placeholder={UI.prospection.critereZonesPlaceholder} value={zones} onChange={e => setZones(e.target.value)} />
          <input className="ct-input" placeholder={UI.prospection.budgetMaxPlaceholder} type="number" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} />
          <input className="ct-input" placeholder={UI.prospection.surfaceMinPlaceholder} type="number" value={surfaceMin} onChange={e => setSurfaceMin(e.target.value)} />
          <button className="ct-seg-btn primary" onClick={save} disabled={saving}>{saving ? UI.prospection.saving : UI.prospection.save}</button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
        {error ? <p className="ct-error" style={{ padding: "var(--ct-space-md)" }}>{error}</p> : null}
        {loading ? <Spinner /> : (
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

function Spinner() {
  return <div className="prospection-spinner">Chargement…</div>;
}
