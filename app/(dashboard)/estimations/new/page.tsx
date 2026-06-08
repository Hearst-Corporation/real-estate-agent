"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eyebrow, Title, Sub, Card } from "@/components/cockpit/primitives";
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
      <>
        <Eyebrow>{t.eyebrow}</Eyebrow>
        <Title>{t.newCta}</Title>
        <Sub>{t.interviewSub}</Sub>
        <Card>
          <p className="ct-error">{error}</p>
        </Card>
        <div className="ct-mb-sm" />
        <Link href="/estimations" className="ct-seg-btn primary">
          {t.back}
        </Link>
      </>
    );
  }

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.newCta}</Title>
      <Sub>{t.interviewSub}</Sub>
      <Card>
        <p className="ct-placeholder">{t.creating}</p>
      </Card>
    </>
  );
}
