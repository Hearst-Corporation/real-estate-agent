"use client";

import Link from "next/link";
import { eur, dateFr } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";
import { Card } from "@/components/cockpit/primitives";

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
    <Card>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {label}
        </span>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-slate-400">
          {count}
        </span>
      </div>
      {leads.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{t.cockpit.zoneEmpty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {leads.slice(0, 3).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2">
              <Link
                href={`/leads/${l.id}`}
                className="truncate text-sm font-medium text-slate-100 hover:text-indigo-300"
              >
                {l.full_name}
              </Link>
              <span className="shrink-0 text-xs text-slate-500">{meta(l)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-4">
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

      <Card>
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {t.recentActivity}
        </div>
        {byRecent.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t.zoneEmpty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {byRecent.slice(0, 5).map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <Link
                  href={`/leads/${l.id}`}
                  className="truncate text-sm font-medium text-slate-100 hover:text-indigo-300"
                >
                  {l.full_name}
                </Link>
                <span className="shrink-0 text-xs text-slate-500">
                  {(UI.leads.statusLabels[l.status] ?? l.status)} · {dateFr(l.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
