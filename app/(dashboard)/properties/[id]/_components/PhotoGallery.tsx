"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";

type Photo = {
  id: string;
  url: string;
  position: number;
  is_cover: boolean;
};

interface PhotoGalleryProps {
  photos: Photo[];
  propertyId: string;
  onDelete?: (photoId: string) => void;
}

export function PhotoGallery({ photos, propertyId, onDelete }: PhotoGalleryProps) {
  const t = UI.properties.photos;
  const router = useRouter();
  const [selected, setSelected] = useState<Photo | null>(photos[0] ?? null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(photo: Photo) {
    if (!confirm(t.delete + " ?")) return;
    setDeleting(photo.id);
    try {
      const res = await fetch(`/api/properties/${propertyId}/photos/${photo.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDelete?.(photo.id);
        if (selected?.id === photo.id) {
          const remaining = photos.filter(p => p.id !== photo.id);
          setSelected(remaining[0] ?? null);
        }
        // Re-fetch côté serveur : reflète la suppression + la cover réassignée.
        router.refresh();
      }
    } finally {
      setDeleting(null);
    }
  }

  if (photos.length === 0) {
    return (
      <div className="property-photo-empty">
        <span className="ct-placeholder">{t.empty}</span>
      </div>
    );
  }

  return (
    <div className="property-gallery">
      {/* Visionneuse principale */}
      <div className="property-gallery-main">
        {selected && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.url}
              alt="Photo du bien"
              className="property-gallery-img"
            />
            {selected.is_cover && (
              <span className="property-gallery-cover-badge">{t.cover}</span>
            )}
          </>
        )}
      </div>
      {/* Miniatures */}
      {photos.length > 1 && (
        <div className="property-gallery-thumbs">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={`property-gallery-thumb${selected?.id === photo.id ? " active" : ""}`}
              onClick={() => setSelected(photo)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="property-gallery-thumb-img" />
              <button
                type="button"
                className="property-gallery-thumb-del"
                onClick={(e) => { e.stopPropagation(); void handleDelete(photo); }}
                disabled={deleting === photo.id}
                aria-label={t.delete}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Bouton supprimer photo principale si 1 seule */}
      {photos.length === 1 && selected && (
        <button
          type="button"
          className="ct-seg-btn danger"
          onClick={() => void handleDelete(selected)}
          disabled={deleting === selected.id}
        >
          {t.delete}
        </button>
      )}
    </div>
  );
}
