"use client";

import Link from "next/link";
import { eur, dateFr } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";

export type CockpitLead = {
  id: string;
  full_name: string;
  status: string;
  kind: string | null;
  budget_min: number | null;
  budget_max: number | null;
  created_at: string;
  updated_at: string;
};

/** Avancé = qualifié ou plus loin dans le pipeline (acheteur/vendeur engagé). */
const ADVANCED = new Set(["qualifie", "visite", "offre"]);
/** À relancer = entré mais pas encore qualifié. */
const TO_FOLLOW = new Set(["nouveau", "contacte"]);

function budgetLabel(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${eur(min)} – ${eur(max)}`;
  if (max != null) return `≤ ${eur(max)}`;
  if (min != null) return `≥ ${eur(min)}`;
  return "—";
}

/** Zone compacte : titre + compteur + 3 items max + lien « voir tout ». */
function Zone({
  label,
  count,
  leads,
  meta,
}: {
  label: string;
  count: number;
  leads: CockpitLead[];
  meta: (l: CockpitLead) => string;
}) {
  const t = UI.leads;
  return (
    <div className="lead-cockpit-zone">
      <div className="lead-cockpit-zone-head">
        <span className="ct-card-title">{label}</span>
        <span className="ct-badge is-muted">{count}</span>
      </div>
      {leads.length === 0 ? (
        <p className="ct-placeholder lead-cockpit-empty">{t.cockpit.zoneEmpty}</p>
      ) : (
        <ul className="lead-cockpit-list">
          {leads.slice(0, 3).map((l) => (
            <li key={l.id} className="lead-cockpit-item">
              <Link href={`/leads/${l.id}`} className="lead-cockpit-item-name">
                {l.full_name}
              </Link>
              <span className="lead-cockpit-item-meta">{meta(l)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Vue COCKPIT relationnel des clients : zones métier dérivées des leads (à
 * relancer / nouveaux / vendeurs chauds / acquéreurs actifs) + activité récente.
 * Lecture seule, aucune action destructive exposée. La liste/kanban complète
 * reste accessible via le toggle parent.
 */
export function LeadsCockpit({ leads }: { leads: CockpitLead[] }) {
  const t = UI.leads.cockpit;

  const byRecent = [...leads].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const byCreated = [...leads].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const toFollow = byRecent.filter((l) => TO_FOLLOW.has(l.status));
  const fresh = byCreated.filter((l) => l.status === "nouveau");
  const hotSellers = byRecent.filter((l) => l.kind === "vendeur" && ADVANCED.has(l.status));
  const activeBuyers = byRecent.filter((l) => l.kind === "acheteur" && ADVANCED.has(l.status));

  return (
    <div className="lead-cockpit">
      <div className="lead-cockpit-grid">
        <Zone
          label={t.toFollow}
          count={toFollow.length}
          leads={toFollow}
          meta={(l) => budgetLabel(l.budget_min, l.budget_max)}
        />
        <Zone
          label={t.fresh}
          count={fresh.length}
          leads={fresh}
          meta={(l) => dateFr(l.created_at)}
        />
        <Zone
          label={t.hotSellers}
          count={hotSellers.length}
          leads={hotSellers}
          meta={(l) => budgetLabel(l.budget_min, l.budget_max)}
        />
        <Zone
          label={t.activeBuyers}
          count={activeBuyers.length}
          leads={activeBuyers}
          meta={(l) => budgetLabel(l.budget_min, l.budget_max)}
        />
      </div>

      <div className="lead-cockpit-activity">
        <div className="ct-card-title">{t.recentActivity}</div>
        {byRecent.length === 0 ? (
          <p className="ct-placeholder">{t.zoneEmpty}</p>
        ) : (
          <ul className="lead-cockpit-activity-list">
            {byRecent.slice(0, 5).map((l) => (
              <li key={l.id} className="lead-cockpit-activity-item">
                <Link href={`/leads/${l.id}`} className="lead-cockpit-item-name">
                  {l.full_name}
                </Link>
                <span className="lead-cockpit-item-meta">
                  {(UI.leads.statusLabels[l.status] ?? l.status)} · {dateFr(l.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
