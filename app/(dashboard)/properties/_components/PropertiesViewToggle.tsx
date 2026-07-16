"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { PropertyKanban } from "@/components/cockpit/PropertyKanban";
import { PropertiesCockpit, type CockpitProperty } from "./PropertiesCockpit";
import { eur, sqm } from "@/lib/crm/format";
import { statusTone, type StatusTone } from "@/lib/crm/statusTone";
import { UI } from "@/lib/ui-strings";

type Property = CockpitProperty & {
  surface: number | null;
  cover_photo_url?: string | null;
};

/** Tonalité métier (`statusTone`) → couleur de Badge Catalyst (état). */
const STATUS_TONE_COLOR: Record<StatusTone, "lime" | "red" | "amber"> = {
  "is-positive": "lime",
  "is-negative": "red",
  "is-pending": "amber",
};

/** Bouton de suppression inline (confirm + DELETE + refresh). */
function DeleteAction({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    if (!confirm(label)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(UI.common.httpError(res.status));
        return;
      }
      router.refresh();
    } catch {
      setError(UI.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button plain onClick={handle} disabled={busy} aria-label={label}>
        {label}
      </Button>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </span>
  );
}

export function PropertiesViewToggle({ properties }: { properties: Property[] }) {
  // Vue COCKPIT par défaut (métier) ; kanban + liste restent accessibles.
  const [view, setView] = useState<"cockpit" | "kanban" | "list">("cockpit");
  const t = UI.properties;

  const views: { key: typeof view; label: string }[] = [
    { key: "cockpit", label: t.cockpit.tabCockpit },
    { key: "kanban", label: t.cockpit.tabKanban },
    { key: "list", label: t.cockpit.tabList },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text className="font-semibold !text-zinc-950 dark:!text-white">
          {t.cockpit.panelTitle}
        </Text>
        <div className="flex items-center gap-1 rounded-xl border border-zinc-950/10 bg-zinc-950/[0.02] p-1 dark:border-white/10 dark:bg-white/[0.03]">
          {views.map((v) =>
            view === v.key ? (
              <Button key={v.key} color="indigo" onClick={() => setView(v.key)}>
                {v.label}
              </Button>
            ) : (
              <Button key={v.key} plain onClick={() => setView(v.key)}>
                {v.label}
              </Button>
            )
          )}
        </div>
      </div>

      {view === "cockpit" ? (
        <PropertiesCockpit properties={properties} />
      ) : view === "kanban" ? (
        <PropertyKanban properties={properties} />
      ) : properties.length === 0 ? (
        <div className="surface p-8 text-center">
          <Text>{t.empty}</Text>
        </div>
      ) : (
        <Table striped>
          <TableHead>
            <TableRow>
              <TableHeader>{t.table.title}</TableHeader>
              <TableHeader>{t.table.type}</TableHeader>
              <TableHeader>{t.table.city}</TableHeader>
              <TableHeader className="text-right">{t.table.surface}</TableHeader>
              <TableHeader className="text-right">{t.table.price}</TableHeader>
              <TableHeader>{t.table.status}</TableHeader>
              <TableHeader className="text-right">{t.table.action}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {properties.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link
                    href={`/properties/${p.id}`}
                    className="font-medium text-accent-600 hover:text-accent-500 dark:text-accent-400 dark:hover:text-accent-300"
                  >
                    {p.title ?? t.fallbackTitle}
                  </Link>
                </TableCell>
                <TableCell>{t.typeLabels[p.property_type ?? ""] ?? p.property_type ?? "—"}</TableCell>
                <TableCell>{p.city ?? "—"}</TableCell>
                <TableCell className="text-right">{sqm(p.surface)}</TableCell>
                <TableCell className="text-right">{eur(p.asking_price)}</TableCell>
                <TableCell>
                  <Badge color={STATUS_TONE_COLOR[statusTone("property", p.status)]}>
                    {t.statusLabels[p.status] ?? p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button outline href={`/properties/${p.id}`}>
                      {t.open}
                    </Button>
                    <DeleteAction id={p.id} label={t.delete} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
