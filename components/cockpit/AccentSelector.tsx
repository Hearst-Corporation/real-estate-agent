"use client";

import { useEffect, useState } from "react";

const ACCENTS: { id: string; color: string }[] = [
  { id: "default", color: "#be123c" },
  { id: "hive", color: "#2ecfc2" },
  { id: "halo", color: "#f59e0b" },
  { id: "hyper", color: "#3b82f6" },
  { id: "hustle", color: "#10b981" },
  { id: "gold", color: "#d4af37" },
];

export function AccentSelector() {
  const [active, setActive] = useState("default");

  useEffect(() => {
    const saved = localStorage.getItem("cockpit:accent") || "default";
    setActive(saved);
    document.documentElement.dataset.product = saved;
    const custom = localStorage.getItem("cockpit:accent-custom");
    if (custom && saved === "custom") applyCustom(custom);
  }, []);

  function pick(id: string) {
    setActive(id);
    localStorage.setItem("cockpit:accent", id);
    document.documentElement.dataset.product = id;
    // Nettoyer les overrides custom inline
    const root = document.documentElement.style;
    root.removeProperty("--ct-accent");
    root.removeProperty("--ct-accent-strong");
    root.removeProperty("--ct-border-accent");
  }

  function applyCustom(hex: string) {
    const root = document.documentElement.style;
    root.setProperty("--ct-accent", hex);
    root.setProperty("--ct-accent-strong", hex);
    root.setProperty("--ct-border-accent", hex);
  }

  function onColor(e: React.ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value;
    setActive("custom");
    localStorage.setItem("cockpit:accent", "custom");
    localStorage.setItem("cockpit:accent-custom", hex);
    document.documentElement.dataset.product = "default";
    applyCustom(hex);
  }

  return (
    <div className="ct-accent-row" role="group" aria-label="Accent">
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
        title="Couleur libre"
        aria-label="Couleur personnalisée"
        onChange={onColor}
      />
    </div>
  );
}
