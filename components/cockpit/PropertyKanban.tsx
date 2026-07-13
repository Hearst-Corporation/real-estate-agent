"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { eur, sqm, PROPERTY_STATUSES } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";
import Link from "next/link";
import { Icon } from "./Icon";

type Property = {
  id: string;
  status: string;
  title: string | null;
  property_type: string | null;
  city: string | null;
  surface: number | null;
  asking_price: number | null;
  cover_photo_url?: string | null;
};

interface PropertyKanbanProps {
  properties: Property[];
  onStatusChange?: (id: string, newStatus: string) => void;
}

export function PropertyKanban({ properties, onStatusChange }: PropertyKanbanProps) {
  const t = UI.properties;
  const router = useRouter();
  const [dropError, setDropError] = React.useState<string | null>(null);

  // Group properties by status
  const columns = PROPERTY_STATUSES.map(status => ({
    id: status,
    title: t.statusLabels[status] || status,
    properties: properties.filter(p => p.status === status)
  }));

  const handleDragStart = (e: React.DragEvent, propertyId: string) => {
    e.dataTransfer.setData("propertyId", propertyId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const propertyId = e.dataTransfer.getData("propertyId");
    if (propertyId && onStatusChange) {
      onStatusChange(propertyId, newStatus);
    } else if (propertyId) {
      // Fallback if no handler provided: call API directly
      setDropError(null);
      try {
        const res = await fetch(`/api/properties/${propertyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Refresh serveur sans recharger la page (conserve scroll & état).
        router.refresh();
      } catch {
        setDropError(t.statusUpdateError);
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {dropError && (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {dropError}
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map(col => (
          <div
            key={col.id}
            className="flex w-72 shrink-0 flex-col gap-3 rounded-xl border border-zinc-950/10 bg-zinc-950/[0.02] p-3"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-sm font-semibold text-zinc-900">{col.title}</span>
              <span className="rounded-full border border-zinc-950/10 bg-zinc-950/5 px-2 py-0.5 text-xs font-medium text-zinc-600">
                {col.properties.length}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {col.properties.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-950/10 py-6" />
              ) : (
                col.properties.map(property => (
                  <div
                    key={property.id}
                    className="cursor-grab overflow-hidden rounded-xl border border-zinc-950/10 bg-white shadow-sm shadow-zinc-950/5 transition-colors hover:border-zinc-950/20 active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => handleDragStart(e, property.id)}
                  >
                    <div className="relative h-32 w-full bg-zinc-950/5">
                      {property.cover_photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={property.cover_photo_url}
                          alt={property.title || t.photos.altFallback}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          <span className="text-xs text-zinc-500">{t.photos.empty}</span>
                        </div>
                      )}
                      <div className="absolute left-2 top-2">
                        <span className="rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
                          {t.typeLabels[property.property_type ?? ""] || property.property_type || "Bien"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 p-3">
                      <div>
                        <span
                          className="block truncate text-sm font-medium text-zinc-900"
                          title={property.title || t.fallbackTitle}
                        >
                          {property.title || t.fallbackTitle}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-1">
                          <Icon name="search" className="size-3" />
                          {property.city || "—"}
                        </span>
                        {property.surface && (
                          <span>• {sqm(property.surface)}</span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-zinc-900">{eur(property.asking_price)}</span>

                        <Link
                          href={`/properties/${property.id}`}
                          className="rounded-lg border border-zinc-950/10 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-950/5"
                        >
                          {t.open}
                        </Link>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
