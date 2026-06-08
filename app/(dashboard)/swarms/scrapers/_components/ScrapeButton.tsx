"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";

/** Déclenche une passe d'ingestion d'annonces à la demande. */
export function ScrapeButton({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const t = UI.scrapers;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleScrape() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/prospection/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setMsg(t.launchError);
        return;
      }
      const data = (await res.json()) as { inserted?: number };
      const n = data.inserted ?? 0;
      setMsg(n > 0 ? t.resultOk(n) : t.resultEmpty);
      router.refresh();
    } catch {
      setMsg(t.launchError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ct-inline-actions">
      <button
        type="button"
        className="ct-seg-btn primary"
        onClick={handleScrape}
        disabled={busy || disabled}
      >
        {busy ? t.launching : t.launch}
      </button>
      {msg && <span className="ct-placeholder">{msg}</span>}
    </div>
  );
}
