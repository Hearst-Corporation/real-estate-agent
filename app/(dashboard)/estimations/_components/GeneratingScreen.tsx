"use client";

const KNOWN_STEPS = [
  "Géocodage",
  "Cadastre",
  "Sections cadastrales",
  "Mutations DVF",
  "DPE",
  "Comparables",
  "Valorisation",
  "Annonces comparables",
  "Finalisation",
];

type Props = {
  currentStep: string | null;
};

export function GeneratingScreen({ currentStep }: Props) {
  const currentIdx = currentStep
    ? KNOWN_STEPS.findIndex((s) =>
        currentStep.toLowerCase().includes(s.toLowerCase())
      )
    : -1;

  return (
    <div className="est-generating">
      <div className="est-generating-inner">
        <div className="est-generating-icon">
          <span className="est-generating-pulse" />
        </div>

        <h2 className="ct-h2 est-generating-title">Analyse en cours…</h2>
        <p className="est-generating-sub">
          Nous interrogeons les bases DVF, DPE et les annonces du marché.
        </p>

        <div className="est-generating-steps">
          {KNOWN_STEPS.map((step, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div
                key={step}
                className={`est-gen-step${done ? " done" : ""}${active ? " active" : ""}`}
              >
                <span className="est-gen-step-icon">
                  {done ? "✓" : active ? "⏳" : "○"}
                </span>
                <span className="est-gen-step-label">{step}</span>
              </div>
            );
          })}
        </div>

        {currentStep && (
          <p className="est-generating-current">{currentStep}</p>
        )}
      </div>
    </div>
  );
}
