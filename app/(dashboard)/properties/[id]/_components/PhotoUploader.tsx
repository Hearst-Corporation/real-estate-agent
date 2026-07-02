"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
        dragOver
          ? "border-indigo-400/60 bg-indigo-500/10"
          : "border-white/15 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
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
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        style={{ display: "none" }}
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <span className="text-sm text-slate-400">
        {uploading ? t.uploading : t.upload}
      </span>
      {error && (
        <p className="text-xs text-red-400" onClick={(e) => e.stopPropagation()}>
          {error}
        </p>
      )}
    </div>
  );
}
