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
      <div className="flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] py-12">
        <span className="text-sm text-slate-500">{t.empty}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Visionneuse principale */}
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
        {selected && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.url}
              alt="Photo du bien"
              className="h-80 w-full object-cover"
            />
            {selected.is_cover && (
              <span className="absolute left-3 top-3 rounded-full bg-indigo-500/90 px-2.5 py-1 text-xs font-semibold text-white shadow-lg">
                {t.cover}
              </span>
            )}
          </>
        )}
      </div>
      {/* Miniatures */}
      {photos.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={`group relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border transition-colors ${
                selected?.id === photo.id
                  ? "border-indigo-400/60"
                  : "border-white/10 hover:border-white/30"
              }`}
              onClick={() => setSelected(photo)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="size-full object-cover" />
              <button
                type="button"
                className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/70 text-xs leading-none text-white opacity-0 transition-opacity hover:bg-red-500/90 group-hover:opacity-100 disabled:opacity-50"
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
          className="self-start rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
          onClick={() => void handleDelete(selected)}
          disabled={deleting === selected.id}
        >
          {t.delete}
        </button>
      )}
    </div>
  );
}
