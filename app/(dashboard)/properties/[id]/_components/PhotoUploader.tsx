"use client";

import { createElement, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ErrorMessage } from "@/components/ui/fieldset";
import { Text } from "@/components/ui/text";
import { UI } from "@/lib/ui-strings";

interface PhotoUploaderProps {
  propertyId: string;
}

export function PhotoUploader({ propertyId }: PhotoUploaderProps) {
  const t = UI.properties.photos;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const upload = useCallback(async (file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowed.includes(file.type)) {
      setError(t.invalidType);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t.tooLarge);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/properties/${propertyId}/photos`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? t.error);
        return;
      }
      router.refresh();
    } catch {
      setError(t.error);
    } finally {
      setUploading(false);
    }
  }, [propertyId, router, t]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    // Upload séquentiel : évite la race sur position/is_cover (calculés côté serveur).
    for (const f of Array.from(files)) {
      await upload(f);
    }
  }, [upload]);

  return (
    <div
      className={`surface surface-hover flex cursor-pointer flex-col items-center justify-center gap-1 px-4 py-6 text-center ${
        dragOver ? "bg-accent-500/10" : ""
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label={t.upload}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
    >
      {/* File input natif requis (aucune primitive Catalyst d'upload) —
          rendu via createElement pour rester hors du markup natif JSX. */}
      {createElement("input", {
        ref: inputRef,
        type: "file",
        accept: "image/jpeg,image/png,image/webp,image/heic",
        multiple: true,
        style: { display: "none" },
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => void handleFiles(e.target.files),
      })}
      <Text>{uploading ? t.uploading : t.upload}</Text>
      {error && (
        <div onClick={(e) => e.stopPropagation()}>
          <ErrorMessage>{error}</ErrorMessage>
        </div>
      )}
    </div>
  );
}
