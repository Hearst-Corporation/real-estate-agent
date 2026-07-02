"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eyebrow, Title, Sub, Card, PageStack } from "@/components/cockpit/primitives";
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

  if (error) {
    return (
      <PageStack>
        <Eyebrow>{t.eyebrow}</Eyebrow>
        <Title>{t.newCta}</Title>
        <Sub>{t.interviewSub}</Sub>
        <Card>
          <p className="text-sm text-red-400">{error}</p>
        </Card>
        <div>
          <Link
            href="/estimations"
            className="inline-flex items-center rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-500/25"
          >
            {t.back}
          </Link>
        </div>
      </PageStack>
    );
  }

  return (
    <PageStack>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.newCta}</Title>
      <Sub>{t.interviewSub}</Sub>
      <Card>
        <p className="text-sm text-slate-500">{t.creating}</p>
      </Card>
    </PageStack>
  );
}
