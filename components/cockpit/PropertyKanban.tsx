"use client";

import React from "react";
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
      try {
        await fetch(`/api/properties/${propertyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        window.location.reload();
      } catch (err) {
        console.error("Failed to update status", err);
      }
    }
  };

  return (
    <div className="crm-kanban">
      {columns.map(col => (
        <div 
          key={col.id} 
          className="crm-col"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, col.id)}
        >
          <div className="crm-col-head">
            <span>{col.title}</span>
            <span className="ct-badge is-muted">{col.properties.length}</span>
          </div>
          <div className="crm-col-body">
            {col.properties.length === 0 ? (
              <div className="crm-col-empty" />
            ) : (
              col.properties.map(property => (
                <div 
                  key={property.id} 
                  className="crm-card"
                  style={{ padding: 0, overflow: 'hidden' }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, property.id)}
                >
                  <div style={{ height: 120, width: '100%', backgroundColor: 'var(--ct-surface-2)', position: 'relative', overflow: 'hidden' }}>
                    {property.cover_photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={property.cover_photo_url}
                        alt={property.title || "Bien immobilier"}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 'var(--ct-fs-2xs)', color: 'var(--ct-text-faint)' }}>{t.photos.empty}</span>
                      </div>
                    )}
                    <div style={{ position: 'absolute', top: 'var(--ct-space-xs)', right: 'var(--ct-space-xs)' }}>
                      <span className="ct-badge ct-badge-overlay">
                        {t.typeLabels[property.property_type ?? ""] || property.property_type || "Bien"}
                      </span>
                    </div>
                  </div>
                  
                  <div style={{ padding: 'var(--ct-space-sm)' }}>
                    <div className="crm-card-head" style={{ marginBottom: 'var(--ct-space-2xs)' }}>
                      <span className="crm-card-title" title={property.title || t.fallbackTitle}>
                        {property.title || t.fallbackTitle}
                      </span>
                    </div>
                    
                    <div className="crm-card-meta" style={{ marginBottom: 'var(--ct-space-xs)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--ct-space-2xs)' }}>
                        <Icon name="search" style={{ width: 12, height: 12 }} /> 
                        {property.city || "—"}
                      </span>
                      {property.surface && (
                        <span>• {sqm(property.surface)}</span>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--ct-space-xs)' }}>
                      <span className="crm-card-price">{eur(property.asking_price)}</span>

                      <div style={{ display: 'flex', gap: 'var(--ct-space-2xs)' }}>
                        <Link href={`/properties/${property.id}`} className="ct-seg-btn" style={{ padding: 'var(--ct-space-2xs) var(--ct-space-xs)', fontSize: 'var(--ct-fs-2xs)' }}>
                          Ouvrir
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
