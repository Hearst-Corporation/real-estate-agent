"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
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
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(photo: Photo) {
    if (!confirm(t.delete + " ?")) return;
    setDeleting(photo.id);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/photos/${photo.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(UI.common.httpError(res.status));
        return;
      }
      onDelete?.(photo.id);
      if (selected?.id === photo.id) {
        const remaining = photos.filter(p => p.id !== photo.id);
        setSelected(remaining[0] ?? null);
      }
      // Re-fetch côté serveur : reflète la suppression + la cover réassignée.
      router.refresh();
    } catch {
      setError(UI.common.networkError);
    } finally {
      setDeleting(null);
    }
  }

  if (photos.length === 0) {
    return (
      <div className="surface flex items-center justify-center py-12">
        <Text>{t.empty}</Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Text className="text-red-400">{error}</Text> : null}
      {/* Visionneuse principale */}
      <div className="surface relative overflow-hidden">
        {selected && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.url}
              alt="Photo du bien"
              className="h-80 w-full object-cover"
            />
            {selected.is_cover && (
              <span className="absolute left-3 top-3">
                <Badge variant="brand">{t.cover}</Badge>
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
              role="button"
              tabIndex={0}
              className={`group relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border transition-colors ${
                selected?.id === photo.id
                  ? "border-accent-500/60"
                  : "border-zinc-950/10 hover:border-zinc-950/30 dark:border-white/10 dark:hover:border-white/30"
              }`}
              onClick={() => setSelected(photo)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(photo);
                }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="size-full object-cover" />
              <Button
                color="red"
                className="absolute! right-0.5 top-0.5 size-4! px-0! py-0! text-xs! opacity-0 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); void handleDelete(photo); }}
                disabled={deleting === photo.id}
                aria-label={t.delete}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
      {/* Bouton supprimer photo principale si 1 seule */}
      {photos.length === 1 && selected && (
        <div className="self-start">
          <Button
            color="red"
            onClick={() => void handleDelete(selected)}
            disabled={deleting === selected.id}
          >
            {t.delete}
          </Button>
        </div>
      )}
    </div>
  );
}
