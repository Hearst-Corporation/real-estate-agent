"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { UI } from "@/lib/ui-strings";
import SwarmKickoffPanel from "./SwarmKickoffPanel";
import type { Swarm } from "@/lib/swarms/types";

export default function SwarmContextualPanel({ estimationId }: { estimationId: string }) {
  // estimationId reserved for future contextual swarm filtering
  void estimationId;
  const [swarms, setSwarms] = useState<Swarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    fetch("/api/swarms")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { items?: Swarm[] }) => {
        const active = (data?.items ?? []).filter((s) => s.is_active);
        setSwarms(active);
        if (active.length > 0) setSelectedId(active[0].id);
      })
      .catch(() => setSwarms([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="ct-placeholder swarm-ctx-hint">{UI.swarms.contextualLoading}</p>;
  }

  if (swarms.length === 0) {
    return (
      <div className="swarm-stack">
        <p className="ct-placeholder swarm-ctx-hint">
          {UI.swarms.contextualEmpty}
        </p>
        <Link href="/swarms/new" className="ct-btn ct-btn-secondary swarm-ctx-cta">
          {UI.swarms.contextualCta}
        </Link>
      </div>
    );
  }

  const selectedSwarm = swarms.find((s) => s.id === selectedId);

  return (
    <div className="swarm-stack">
      <select
        className="crm-input"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {swarms.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {selectedSwarm && (
        // key = remount propre quand on change de swarm dans le sélecteur
        // (sinon l'état du run précédent persisterait).
        <SwarmKickoffPanel key={selectedSwarm.id} swarmId={selectedSwarm.id} swarmName={selectedSwarm.name} />
      )}
    </div>
  );
}
