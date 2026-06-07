"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { PageSegmentTabs } from "@/components/cockpit/PageSegmentTabs";
import { PageHeader, Card, PageStack } from "@/components/cockpit/primitives";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { MATCH_SCORE_ALERT } from "@/lib/prospection/types";

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
const TABS: readonly Tab[] = ["acquereurs", "matching", "annonces", "criteres"];

function tabFromParam(value: string | null): Tab {
  return TABS.includes(value as Tab) ? (value as Tab) : "acquereurs";
}

export default function ProspectionPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => tabFromParam(searchParams.get("tab")));
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

    async function loadInitial() {
      try {
        const initialTab = tabFromParam(searchParams.get("tab"));
        const endpoint =
          initialTab === "annonces"
            ? "/api/prospection/annonces"
            : initialTab === "matching"
              ? "/api/prospection/matchs"
              : "/api/prospection/criteres";
        const res = await fetch(endpoint);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Erreur HTTP ${res.status}`);
          return;
        }
        if (initialTab === "annonces") setAnnonces(json.data ?? []);
        else if (initialTab === "matching") setMatchs(json.data ?? []);
        else setCriteres(json.data ?? []);
      } catch {
        if (!cancelled) setError(UI.prospection.loadCriteresError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

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
        <div className="prospection-acquereur-tags">
          {c.type_bien?.map((type) => <span key={type} className="prospection-pill">{type}</span>)}
          {c.surface_min ? <span className="prospection-pill">{c.surface_min} m² min</span> : null}
          {c.pieces_min ? <span className="prospection-pill">{c.pieces_min} p min</span> : null}
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
          <div className="prospection-annonce-title">{a.titre ?? a.type_bien}</div>
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
        <div className="prospection-acquereur-tags">
          {a.is_pap && <span className="prospection-pap">PAP</span>}
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
        <div className={`prospection-score${m.score_match >= MATCH_SCORE_ALERT ? " is-good" : ""}`}>
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
            <div className="prospection-annonce-title">{a.titre ?? a.type_bien}</div>
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
        <div className="prospection-match-actions">
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
        kicker={UI.prospection.eyebrow}
        title={UI.prospection.title}
        action={
          <button type="button" className="ct-seg-btn primary" onClick={() => selectTab("criteres")}>
            + Nouvel acquéreur
          </button>
        }
        nav={
          <PageSegmentTabs
            tabs={[
              { id: "acquereurs", label: UI.prospection.acquereurs },
              { id: "annonces", label: UI.prospection.annonces },
              { id: "matching", label: UI.prospection.matching },
              { id: "criteres", label: UI.prospection.criteres },
            ]}
            active={tab}
            onSelect={selectTab}
          />
        }
        kpis={[
          { label: UI.prospection.acquereurs, value: String(criteres.length) },
          { label: "Matchs", value: String(matchs.length) },
          { label: "Annonces", value: String(annonces.length) },
          { label: "Alertes", value: String(criteres.filter(c => c.alerte_email || c.alerte_whatsapp).length) },
        ]}
      />

      <Card variant="dense">
        {tab === "acquereurs" && (
          <div className="prospection-list">
            {error && criteres.length > 0 ? <p className="ct-error ct-error-pad">{error}</p> : null}
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
            <div className="prospection-toolbar inset">
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
            {error && annonces.length > 0 ? <p className="ct-error ct-error-pad">{error}</p> : null}
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
            <div className="prospection-panel-head">
              <p className="prospection-hint">
                {UI.prospection.matchingHint}
              </p>
              <button type="button" className="ct-seg-btn prospection-refresh" onClick={() => loadMatchs()}>
                {UI.prospection.refresh}
              </button>
            </div>
            {error && matchs.length > 0 ? <p className="ct-error ct-error-pad">{error}</p> : null}
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
        <button type="button" className="prospection-delete-btn" onClick={() => deleteCritere(c.id)}>
          {UI.prospection.delete}
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="prospection-panel-head">
        <span className="ct-subtext">{UI.prospection.criteresCount(criteres.length)}</span>
        <div className="ct-seg-track">
          <button className="ct-seg-btn" onClick={loadCriteres}>{UI.prospection.refresh}</button>
          <button className="ct-seg-btn primary" onClick={() => setShowForm(v => !v)}>{UI.prospection.newCritere}</button>
        </div>
      </div>
      {showForm && (
        <div className="ct-card prospection-form-card">
          <input className="ct-input" placeholder={UI.prospection.critereNamePlaceholder} value={nom} onChange={e => setNom(e.target.value)} />
          <input className="ct-input" placeholder={UI.prospection.critereZonesPlaceholder} value={zones} onChange={e => setZones(e.target.value)} />
          <input className="ct-input" placeholder={UI.prospection.budgetMaxPlaceholder} type="number" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} />
          <input className="ct-input" placeholder={UI.prospection.surfaceMinPlaceholder} type="number" value={surfaceMin} onChange={e => setSurfaceMin(e.target.value)} />
          <button className="ct-seg-btn primary" onClick={save} disabled={saving}>{saving ? UI.prospection.saving : UI.prospection.save}</button>
        </div>
      )}
      <div className="ct-col-stack-sm">
        {error ? <p className="ct-error ct-error-pad">{error}</p> : null}
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
