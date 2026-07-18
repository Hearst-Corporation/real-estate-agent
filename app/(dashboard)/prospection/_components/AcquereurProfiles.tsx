"use client";

import { useState } from "react";
import Link from "next/link";
import { UsersIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { UI } from "@/lib/ui-strings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Subheading } from "@/components/ui/heading";
import { Text, Strong } from "@/components/ui/text";
import { CritereForm } from "./CritereForm";
import type { Critere } from "./types";
import {
  zonesLabel,
  budgetLabel,
  urgenceLabel,
  urgenceColor,
  frequenceLabel,
  groupByAcquereur,
} from "./prospection-helpers";

const t = UI.prospection;

/** Une chip clé:valeur pour un critère (essentiel). */
function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-sm text-zinc-800 dark:text-zinc-200">{value}</span>
    </div>
  );
}

/** Groupe de badges secondaire/exclusion — rendu UNIQUEMENT s'il a du contenu
 *  (les blocs « Aucun… » vides gonflaient la carte sans information). */
function ChipsRow({ label, items, color }: { label: string; items: string[]; color: "zinc" | "amber" }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      {items.map((x) => (
        <Badge key={x} color={color}>
          {x}
        </Badge>
      ))}
    </div>
  );
}

/** Carte d'un profil de recherche (un critère) — dense : en-tête + essentiels
 *  toujours visibles ; secondaires / exclusions repliés si vides. */
function ProfilCard({ critere, onEdit }: { critere: Critere; onEdit: () => void }) {
  const c = critere;
  const secondaires = c.criteres_secondaires ? Object.keys(c.criteres_secondaires) : [];
  const exclusions = c.exclusions ?? [];

  return (
    <div className="rounded-xl border border-zinc-950/8 p-3.5 dark:border-white/10">
      <div className="flex items-start justify-between gap-x-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Strong>{c.nom}</Strong>
          <Badge color={urgenceColor(c.urgence)}>
            {t.urgenceLabel} · {urgenceLabel(c.urgence)}
          </Badge>
          <Badge color="zinc">
            {t.profilAlerte} · {frequenceLabel(c.alerte_frequence)}
          </Badge>
        </div>
        <Button plain onClick={onEdit} className="-my-1.5 shrink-0">
          {t.profilEdit}
        </Button>
      </div>

      {/* Essentiels — ligne dense de chips clé:valeur */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <MetaChip label={t.profilBudget} value={budgetLabel(c)} />
        <MetaChip label={t.colZones} value={zonesLabel(c.zones)} />
        {c.surface_min != null && <MetaChip label={t.profilSurface} value={`${c.surface_min}+ m²`} />}
        {c.pieces_min != null && <MetaChip label={t.profilPieces} value={`${c.pieces_min}+`} />}
        {c.type_bien && c.type_bien.length > 0 && <MetaChip label={t.profilTypes} value={c.type_bien.join(", ")} />}
      </div>

      {/* Secondaires + exclusions : uniquement si renseignés (sinon rien). */}
      {(secondaires.length > 0 || exclusions.length > 0) && (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-zinc-950/5 pt-2.5 dark:border-white/5">
          <ChipsRow label={t.profilSecondaires} items={secondaires} color="zinc" />
          <ChipsRow label={t.profilExclusions} items={exclusions} color="amber" />
        </div>
      )}
    </div>
  );
}

/**
 * Profils de recherche regroupés par acquéreur (lead_id). Un acquéreur peut avoir
 * plusieurs profils. Chaque profil affiche essentiels / secondaires / exclusions /
 * urgence / fréquence, et peut être édité en place (PATCH LIVE).
 */
export function AcquereurProfiles({ criteres, onChanged }: { criteres: Critere[]; onChanged: () => void | Promise<void> }) { // strings-lint-allow
  const [editing, setEditing] = useState<string | null>(null);
  const groups = groupByAcquereur(criteres);

  if (criteres.length === 0) {
    return (
      <div className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
        <UsersIcon aria-hidden="true" className="size-10 text-zinc-400 dark:text-zinc-500" />
        <Strong>{t.emptyCriteresTitle}</Strong>
        <Text className="max-w-md">{t.emptyCriteresText}</Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Subheading>{t.acquereurProfilsTitle}</Subheading>
        <Text className="text-sm">{t.acquereurProfilsHint}</Text>
      </div>

      {groups.map((g) => (
        <div key={g.leadId ?? "no-lead"} className="surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-zinc-950/8 pb-2.5 dark:border-white/10">
            <div className="flex items-center gap-2">
              <Strong className="text-base">{g.nom}</Strong>
              <Badge color="zinc">{t.acquereurProfilCount(g.criteres.length)}</Badge>
            </div>
            {g.leadId && (
              <Link
                href={`/leads/${g.leadId}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 hover:text-accent-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
              >
                {t.acquereurOpenLead}
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Link>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2.5">
            {g.criteres.map((c) =>
              editing === c.id ? (
                <CritereForm
                  key={c.id}
                  critere={c}
                  onSaved={async () => {
                    setEditing(null);
                    await onChanged();
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <ProfilCard key={c.id} critere={c} onEdit={() => setEditing(c.id)} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
