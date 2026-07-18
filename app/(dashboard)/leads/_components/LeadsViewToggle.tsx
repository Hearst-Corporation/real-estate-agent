"use client";

import React, { useState } from "react";
import Link from "next/link";
import { LeadKanban } from "@/components/cockpit/LeadKanban";
import { StatusSelect } from "@/components/cockpit/StatusSelect";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { LeadRowActions } from "@/app/(dashboard)/leads/_components/LeadRowActions";
import { LeadsCockpit } from "@/app/(dashboard)/leads/_components/LeadsCockpit";
import { eur, LEAD_STATUSES } from "@/lib/crm/format";
import {
  financementSummary,
  financementTone,
  parseFinancement,
  FINANCEMENT_UI,
} from "@/lib/crm/financement";
import { UI } from "@/lib/ui-strings";

function budgetRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${eur(min)} – ${eur(max)}`;
  if (min != null) return `≥ ${eur(min)}`;
  if (max != null) return `≤ ${eur(max)}`;
  return "—";
}

type Lead = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  kind: string | null;
  type_personne: string | null;
  source: string | null;
  budget_min: number | null;
  budget_max: number | null;
  financement: Record<string, unknown> | null;
  property_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function LeadsViewToggle({ leads }: { leads: Lead[] }) {
  // Vue COCKPIT par défaut (métier) ; kanban + liste restent accessibles.
  const [view, setView] = useState<"cockpit" | "kanban" | "list">("cockpit");
  const t = UI.leads;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-titre text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          {t.cockpit.panelTitle}
        </div>
        <div className="flex items-center gap-1">
          {view === "cockpit" ? (
            <Button color="indigo">{t.cockpit.tabCockpit}</Button>
          ) : (
            <Button plain onClick={() => setView("cockpit")}>
              {t.cockpit.tabCockpit}
            </Button>
          )}
          {view === "kanban" ? (
            <Button color="indigo">{t.cockpit.tabKanban}</Button>
          ) : (
            <Button plain onClick={() => setView("kanban")}>
              {t.cockpit.tabKanban}
            </Button>
          )}
          {view === "list" ? (
            <Button color="indigo">{t.cockpit.tabList}</Button>
          ) : (
            <Button plain onClick={() => setView("list")}>
              {t.cockpit.tabList}
            </Button>
          )}
        </div>
      </div>

      {view === "cockpit" ? (
        <LeadsCockpit leads={leads} />
      ) : view === "kanban" ? (
        <LeadKanban leads={leads} />
      ) : leads.length === 0 ? (
        <div className="surface px-6 py-16 text-center">
          <Text>{t.empty}</Text>
        </div>
      ) : (
        <div className="surface overflow-hidden px-2">
          <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t.table.name}</TableHeader>
              <TableHeader>{t.table.kind}</TableHeader>
              <TableHeader>{t.table.status}</TableHeader>
              <TableHeader className="text-right">{t.table.budget}</TableHeader>
              <TableHeader>{FINANCEMENT_UI.cardTitle}</TableHeader>
              <TableHeader>{t.table.source}</TableHeader>
              <TableHeader className="text-right">{t.table.action}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {leads.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/leads/${l.id}`}
                    className="text-accent-600 hover:text-accent-500 dark:text-accent-400 dark:hover:text-accent-300"
                  >
                    {l.full_name}
                  </Link>
                </TableCell>
                <TableCell>
                  {l.kind ? <Badge variant="neutral">{t.kindLabels[l.kind] ?? l.kind}</Badge> : "—"}
                </TableCell>
                <TableCell>
                  <StatusSelect
                    endpoint={`/api/leads/${l.id}`}
                    value={l.status}
                    options={LEAD_STATUSES}
                    labels={t.statusLabels}
                    ariaLabel={t.table.status}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {budgetRange(l.budget_min, l.budget_max)}
                </TableCell>
                <TableCell>
                  {(() => {
                    const fin = parseFinancement(l.financement);
                    if (!fin) {
                      return (
                        <span className="text-zinc-400 dark:text-zinc-500">
                          {FINANCEMENT_UI.notProvided}
                        </span>
                      );
                    }
                    return (
                      <Badge variant={financementTone(fin.mode)}>
                        {financementSummary(l.financement)}
                      </Badge>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {l.source ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <LeadRowActions
                    id={l.id}
                    fullName={l.full_name}
                    defaultValues={{
                      full_name: l.full_name,
                      email: l.email,
                      phone: l.phone,
                      source: l.source,
                      kind: l.kind,
                      type_personne: l.type_personne,
                      budget_min: l.budget_min,
                      budget_max: l.budget_max,
                      status: l.status,
                      financement: l.financement,
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
