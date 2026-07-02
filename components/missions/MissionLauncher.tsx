"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UI } from "@/lib/ui-strings";

const t = UI.missions;

/** Saisie d'un objectif en langage naturel → lance une mission → redirige.
 *  Note : l'architect prend 60-90s, donc le clic attend (« Je prépare… »). */
export function MissionLauncher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [objective, setObjective] = useState(searchParams.get("objective") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launch() {
    if (!objective.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective: objective.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; detail?: string; error?: string };
      if (res.ok && json.id) {
        router.push(`/missions/${json.id}`);
        return;
      }
      setError(json.detail || json.error || t.launchError);
    } catch {
      setError(t.netError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className="min-h-24 w-full resize-y rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none disabled:opacity-50"
        placeholder={t.placeholder}
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
        disabled={busy}
      />
      <button
        type="button"
        className="self-start rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={launch}
        disabled={busy || !objective.trim()}
      >
        {busy ? t.launchBusy : t.launchBtn}
      </button>
      {error && <p className="w-full text-sm text-red-400">{error}</p>}
    </div>
  );
}
