"use client";
import { useState, useEffect, useCallback } from "react";

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
  const [loading, setLoading] = useState(false);
  const [filterEligible, setFilterEligible] = useState(false);

  const loadAnnonces = useCallback(async () => {
    setLoading(true);
    const qs = filterEligible ? "?eligible=1" : "";
    const res = await fetch(`/api/prospection/annonces${qs}`);
    const json = await res.json();
    setAnnonces(json.data ?? []);
    setLoading(false);
  }, [filterEligible]);

  const loadMatchs = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/prospection/matchs");
    const json = await res.json();
    setMatchs(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "annonces") loadAnnonces();
    if (tab === "matching") loadMatchs();
  }, [tab, loadAnnonces, loadMatchs]);

  async function sendFeedback(matchId: string, signal: "like" | "dislike" | "contact" | "visite") {
    await fetch("/api/prospection/matchs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, signal }),
    });
    loadMatchs();
  }

  return (
    <div style={{ padding: "var(--ct-space-xl)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--ct-space-lg)" }}>
        <h1 className="ct-title" style={{ margin: 0 }}>Prospection</h1>
        <div className="ct-seg-track">
          {(["annonces","matching","criteres"] as Tab[]).map(t => (
            <button key={t} className={`ct-seg-btn${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
              {t === "annonces" ? "Annonces" : t === "matching" ? "Matching" : "Critères"}
            </button>
          ))}
        </div>
      </div>

      {tab === "annonces" && (
        <div>
          <div style={{ display: "flex", gap: "var(--ct-space-sm)", marginBottom: "var(--ct-space-md)", alignItems: "center" }}>
            <label style={{ display: "flex", gap: "var(--ct-space-xs)", alignItems: "center", cursor: "pointer", fontSize: "var(--ct-fs-sm)", color: "var(--ct-text-body)" }}>
              <input type="checkbox" checked={filterEligible} onChange={e => setFilterEligible(e.target.checked)} />
              Mandat éligibles uniquement
            </label>
            <span style={{ color: "var(--ct-text-muted)", fontSize: "var(--ct-fs-xs)" }}>{annonces.length} annonces</span>
          </div>
          {loading ? <Spinner /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "var(--ct-space-md)" }}>
              {annonces.map(a => <AnnonceCard key={a.id} annonce={a} />)}
              {!annonces.length && <EmptyState text="Aucune annonce. Le job d'ingestion tourne toutes les heures." />}
            </div>
          )}
        </div>
      )}

      {tab === "matching" && (
        <div>
          <p style={{ color: "var(--ct-text-muted)", fontSize: "var(--ct-fs-sm)", marginBottom: "var(--ct-space-md)" }}>
            Matchs générés par le moteur — score ≥ 50/100. Alertes WhatsApp automatiques si ≥ 70.
          </p>
          {loading ? <Spinner /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
              {matchs.map(m => (
                <MatchCard key={m.id} match={m} onFeedback={(signal) => sendFeedback(m.id, signal)} />
              ))}
              {!matchs.length && <EmptyState text="Aucun match. Créez des critères acquéreur dans l'onglet Critères." />}
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
    <div className="ct-card" style={{ padding: "var(--ct-space-md)" }}>
      {a.mandat_eligible && (
        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 99, background: "var(--ct-accent-soft)", color: "var(--ct-accent)", fontSize: "var(--ct-fs-xs)", fontWeight: 600, marginBottom: "var(--ct-space-xs)" }}>
          Mandat {a.score_mandat}/100
        </span>
      )}
      <div style={{ fontWeight: 600, fontSize: "var(--ct-fs-md)", color: "var(--ct-text-strong)", marginBottom: 4 }}>
        {a.titre ?? a.type_bien}
      </div>
      <div style={{ color: "var(--ct-text-muted)", fontSize: "var(--ct-fs-sm)", marginBottom: "var(--ct-space-xs)" }}>
        {[a.surface && `${a.surface}m²`, a.pieces && `${a.pieces}p`, a.ville ?? a.code_postal].filter(Boolean).join(" · ")}
      </div>
      <div style={{ fontWeight: 700, color: "var(--ct-text-primary)", marginBottom: "var(--ct-space-sm)" }}>{prix}</div>
      {a.is_pap && <span style={{ fontSize: "var(--ct-fs-xs)", color: "var(--ct-success)" }}>PAP</span>}
      {a.url && (
        <a href={a.url} target="_blank" rel="noopener" style={{ display: "block", marginTop: "var(--ct-space-xs)", fontSize: "var(--ct-fs-xs)", color: "var(--ct-accent)" }}>
          Voir l'annonce →
        </a>
      )}
    </div>
  );
}

function MatchCard({ match: m, onFeedback }: { match: Match; onFeedback: (s: "like"|"dislike"|"contact"|"visite") => void }) {
  const a = m.annonce;
  const prix = a.prix ? `${Math.round(a.prix / 1000)}k€` : "NC";
  return (
    <div className="ct-card" style={{ padding: "var(--ct-space-md)", display: "flex", alignItems: "center", gap: "var(--ct-space-md)" }}>
      <div style={{ width: 56, height: 56, borderRadius: "var(--ct-radius-md)", background: "var(--ct-surface-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 22, fontWeight: 700, color: m.score_match >= 70 ? "var(--ct-success)" : "var(--ct-text-body)" }}>
        {m.score_match}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "var(--ct-fs-md)", color: "var(--ct-text-strong)" }}>{a.titre ?? a.type_bien}</div>
        <div style={{ color: "var(--ct-text-muted)", fontSize: "var(--ct-fs-sm)" }}>
          {[a.surface && `${a.surface}m²`, a.pieces && `${a.pieces}p`, a.ville ?? a.code_postal, prix].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div style={{ display: "flex", gap: "var(--ct-space-xs)", flexShrink: 0 }}>
        <FeedbackBtn emoji="👍" onClick={() => onFeedback("like")} />
        <FeedbackBtn emoji="👎" onClick={() => onFeedback("dislike")} />
        <FeedbackBtn emoji="📞" onClick={() => onFeedback("contact")} />
      </div>
    </div>
  );
}

function FeedbackBtn({ emoji, onClick }: { emoji: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: "var(--ct-surface-2)", border: "1px solid var(--ct-border)", borderRadius: "var(--ct-radius-sm)", padding: "6px 10px", cursor: "pointer", fontSize: 16 }}>
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

  useEffect(() => {
    fetch("/api/prospection/criteres").then(r => r.json()).then(j => setCriteres(j.data ?? []));
  }, []);

  async function save() {
    if (!nom.trim()) return;
    setSaving(true);
    await fetch("/api/prospection/criteres", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nom: nom.trim(),
        zones: zones.split(",").map(z => z.trim()).filter(Boolean),
        budget_max: budgetMax ? Number(budgetMax) : null,
        surface_min: surfaceMin ? Number(surfaceMin) : null,
      }),
    });
    const r = await fetch("/api/prospection/criteres").then(r => r.json());
    setCriteres(r.data ?? []);
    setSaving(false);
    setShowForm(false);
    setNom(""); setZones(""); setBudgetMax(""); setSurfaceMin("");
  }

  async function deleteCritere(id: string) {
    await fetch(`/api/prospection/criteres?id=${id}`, { method: "DELETE" });
    setCriteres(c => c.filter(x => x.id !== id));
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--ct-space-md)" }}>
        <span style={{ color: "var(--ct-text-muted)", fontSize: "var(--ct-fs-sm)" }}>{criteres.length} critère(s) actif(s)</span>
        <button className="ct-seg-btn primary" onClick={() => setShowForm(v => !v)}>+ Nouveau critère</button>
      </div>
      {showForm && (
        <div className="ct-card" style={{ padding: "var(--ct-space-md)", marginBottom: "var(--ct-space-md)", display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
          <input className="ct-input" placeholder="Nom du critère (ex: Famille Martin)" value={nom} onChange={e => setNom(e.target.value)} />
          <input className="ct-input" placeholder="Zones (codes postaux séparés par virgule : 75011,75012)" value={zones} onChange={e => setZones(e.target.value)} />
          <input className="ct-input" placeholder="Budget max (€)" type="number" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} />
          <input className="ct-input" placeholder="Surface min (m²)" type="number" value={surfaceMin} onChange={e => setSurfaceMin(e.target.value)} />
          <button className="ct-seg-btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
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
              Supprimer
            </button>
          </div>
        ))}
        {!criteres.length && <EmptyState text="Aucun critère. Créez un profil acquéreur pour démarrer le matching automatique." />}
      </div>
    </div>
  );
}

function Spinner() {
  return <div style={{ color: "var(--ct-text-muted)", padding: "var(--ct-space-lg)" }}>Chargement…</div>;
}
function EmptyState({ text }: { text: string }) {
  return <div style={{ color: "var(--ct-text-muted)", fontSize: "var(--ct-fs-sm)", padding: "var(--ct-space-lg)", textAlign: "center" }}>{text}</div>;
}
