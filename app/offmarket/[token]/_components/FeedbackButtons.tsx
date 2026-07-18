"use client";

/**
 * FeedbackButtons — capture du verdict acquéreur sur un bien d'une sélection.
 *
 * Accès PUBLIC : POST /api/offmarket/[token]/feedback (borné à la sélection par
 * le token). Persiste réellement le verdict ; état optimiste + confirmation ou
 * message d'erreur honnête (jamais un faux « enregistré »).
 */

import { useState } from "react";

type Verdict = "interesse" | "pas_interesse" | "a_revoir";

const OPTIONS: Array<{ value: Verdict; label: string }> = [
  { value: "interesse", label: "Intéressé" },
  { value: "a_revoir", label: "À revoir" },
  { value: "pas_interesse", label: "Pas intéressé" },
];

export function FeedbackButtons({
  token,
  itemId,
  initialVerdict,
}: {
  token: string;
  itemId: string;
  initialVerdict: Verdict | null;
}) {
  const [verdict, setVerdict] = useState<Verdict | null>(initialVerdict);
  const [saving, setSaving] = useState<Verdict | null>(null);
  const [error, setError] = useState(false);

  async function submit(v: Verdict) {
    setSaving(v);
    setError(false);
    const previous = verdict;
    setVerdict(v); // optimiste
    try {
      const res = await fetch(`/api/offmarket/${encodeURIComponent(token)}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, verdict: v }),
      });
      if (!res.ok) {
        setVerdict(previous);
        setError(true);
      }
    } catch {
      setVerdict(previous);
      setError(true);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="om-fb">
      <div className="om-fb-row" role="group" aria-label="Votre avis sur ce bien">
        {OPTIONS.map((o) => {
          const active = verdict === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => submit(o.value)}
              aria-pressed={active}
              disabled={saving !== null}
              className={`om-fb-btn${active ? " om-fb-btn--active" : ""}`}
            >
              {saving === o.value ? "…" : o.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="om-fb-err" role="alert">Enregistrement impossible, réessayez.</p>
      ) : verdict ? (
        <p className="om-fb-ok">Votre avis a bien été enregistré.</p>
      ) : null}
    </div>
  );
}
