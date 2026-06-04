"use client";

import { useEffect, useState } from "react";
import { UI } from "@/lib/ui-strings";

// Palette d'accents (DATA, pas du style) : chaque pastille DOIT afficher sa couleur
// littérale, indépendamment de l'accent actif (sinon toutes identiques → picker cassé).
// Miroir des valeurs html[data-product=...] de cockpit.css — source unique côté TS.
const DEFAULT_ACCENT_ID = "default";
const CUSTOM_ACCENT_ID = "custom";
const STORAGE_KEY = "cockpit:accent";
const STORAGE_CUSTOM_KEY = "cockpit:accent-custom";

const ACCENTS: { id: string; color: string }[] = [
  { id: DEFAULT_ACCENT_ID, color: "#be123c" },
  { id: "hive", color: "#2ecfc2" },
  { id: "halo", color: "#f59e0b" },
  { id: "hyper", color: "#3b82f6" },
  { id: "hustle", color: "#10b981" },
  { id: "gold", color: "#d4af37" },
];

// Helpers DOM purs (module-scope) — appliquent l'accent via data-product ou override inline.
function setProduct(id: string) {
  document.documentElement.dataset.product = id;
}

function applyCustomAccent(hex: string) {
  const root = document.documentElement.style;
  root.setProperty("--ct-accent", hex);
  root.setProperty("--ct-accent-strong", hex);
  root.setProperty("--ct-border-accent", hex);
}

function clearCustomAccent() {
  const root = document.documentElement.style;
  root.removeProperty("--ct-accent");
  root.removeProperty("--ct-accent-strong");
  root.removeProperty("--ct-border-accent");
}

export function AccentSelector() {
  const [active, setActive] = useState(DEFAULT_ACCENT_ID);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCENT_ID;
    // Hydratation post-mount depuis localStorage (indispo en SSR) → setState volontaire.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(saved);
    setProduct(saved);
    const custom = localStorage.getItem(STORAGE_CUSTOM_KEY);
    if (custom && saved === CUSTOM_ACCENT_ID) applyCustomAccent(custom);
  }, []);

  function pick(id: string) {
    setActive(id);
    localStorage.setItem(STORAGE_KEY, id);
    setProduct(id);
    clearCustomAccent();
  }

  function onColor(e: React.ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value;
    setActive(CUSTOM_ACCENT_ID);
    localStorage.setItem(STORAGE_KEY, CUSTOM_ACCENT_ID);
    localStorage.setItem(STORAGE_CUSTOM_KEY, hex);
    setProduct(DEFAULT_ACCENT_ID);
    applyCustomAccent(hex);
  }

  return (
    <div className="ct-accent-row" role="group" aria-label={UI.accent.group}>
      {ACCENTS.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`ct-accent-dot${active === a.id ? " active" : ""}`}
          style={{ background: a.color }}
          title={a.id}
          aria-label={a.id}
          onClick={() => pick(a.id)}
        />
      ))}
      <input
        type="color"
        className="ct-accent-picker"
        title={UI.accent.custom}
        aria-label={UI.accent.customAria}
        onChange={onColor}
      />
    </div>
  );
}
