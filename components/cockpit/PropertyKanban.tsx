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
                  className="crm-card crm-card-pad0"
                  draggable
                  onDragStart={(e) => handleDragStart(e, property.id)}
                >
                  <div className="crm-card-media">
                    {property.cover_photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={property.cover_photo_url}
                        alt={property.title || t.photos.altFallback}
                      />
                    ) : (
                      <div className="crm-card-media-empty">
                        <span className="ct-subtext">{t.photos.empty}</span>
                      </div>
                    )}
                    <div className="crm-card-media-badge">
                      <span className="ct-badge ct-badge-overlay">
                        {t.typeLabels[property.property_type ?? ""] || property.property_type || "Bien"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="crm-card-inner">
                    <div className="crm-card-head crm-card-head-tight">
                      <span className="crm-card-title" title={property.title || t.fallbackTitle}>
                        {property.title || t.fallbackTitle}
                      </span>
                    </div>
                    
                    <div className="crm-card-meta crm-card-meta-tight">
                      <span className="crm-card-loc">
                        <Icon name="search" className="ct-icon-xs" /> 
                        {property.city || "—"}
                      </span>
                      {property.surface && (
                        <span>• {sqm(property.surface)}</span>
                      )}
                    </div>
                    
                    <div className="crm-card-foot">
                      <span className="crm-card-price">{eur(property.asking_price)}</span>

                      <div className="crm-card-actions">
                        <Link href={`/properties/${property.id}`} className="ct-seg-btn crm-card-link-sm">
                          {t.open}
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
