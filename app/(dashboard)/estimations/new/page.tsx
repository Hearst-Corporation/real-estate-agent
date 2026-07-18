"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { UI } from "@/lib/ui-strings";

function NewEstimationInner() {
  const t = UI.estimations;
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyId = searchParams.get("property");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      try {
        // ?property=<id> → estimation préremplie depuis un bien CRM ; sinon
        // brouillon vide (corps absent).
        const res = await fetch("/api/estimations", {
          method: "POST",
          signal: ctrl.signal,
          ...(propertyId
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ property_id: propertyId }),
              }
            : {}),
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
  }, [router, propertyId]);

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent-500 dark:text-accent-400">
            {t.eyebrow}
          </p>
          <Heading className="font-titre">{t.newCta}</Heading>
          <Text className="mt-1">{t.interviewSub}</Text>
        </div>
      </div>

      {/* Card conteneur */}
      <section className="surface flex min-h-[40vh] items-center justify-center p-8">
        {error ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-2">
              <Badge color="red">{UI.common.error}</Badge>
              <Text>{error}</Text>
            </div>
            <Button outline href="/estimations">
              {t.back}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative flex size-14 items-center justify-center">
              <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-accent-400/25" />
              <ArrowPathIcon aria-hidden="true" className="relative size-6 animate-spin text-accent-600" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-titre text-lg font-semibold text-zinc-950">{t.creating}</p>
              <Text className="max-w-xs">{t.interviewSub}</Text>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function NewEstimationPage() {
  return (
    <Suspense fallback={null}>
      <NewEstimationInner />
    </Suspense>
  );
}
