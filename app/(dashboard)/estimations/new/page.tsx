"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { UI } from "@/lib/ui-strings";

export default function NewEstimationPage() {
  const t = UI.estimations;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/estimations", {
          method: "POST",
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? UI.estimations.createError);
          return;
        }
        const { id } = await res.json();
        router.replace(`/estimations/${id}`);
      } catch (e) {
        // Abort au démontage (Strict Mode) → on ignore, pas une vraie erreur.
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(UI.common.networkError);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [router]);

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header — bloc TW+ headings__page-headings/01-with-actions (adapté sombre) */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
            {t.eyebrow}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:truncate">{t.newCta}</h1>
          <p className="mt-1 text-sm text-slate-400">{t.interviewSub}</p>
        </div>
      </div>

      {/* Card conteneur — bloc TW+ layout__cards/01-basic-card (adapté sombre) */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        {error ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-red-400">{error}</p>
            <div>
              <Link
                href="/estimations"
                className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
              >
                {t.back}
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <ArrowPathIcon aria-hidden="true" className="size-5 animate-spin text-indigo-300" />
            <p className="text-sm text-slate-400">{t.creating}</p>
          </div>
        )}
      </section>
    </div>
  );
}
