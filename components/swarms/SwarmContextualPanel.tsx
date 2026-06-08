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
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    fetch("/api/swarms")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "engine_fetch_failed");
        return data as { items?: Swarm[] };
      })
      .then((data: { items?: Swarm[] }) => {
        setError(null);
        const active = (data?.items ?? []).filter((s) => s.is_active);
        setSwarms(active);
        if (active.length > 0) setSelectedId(active[0].id);
      })
      .catch(() => {
        setSwarms([]);
        setError(UI.swarms.contextualEngineError);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="ct-placeholder ct-placeholder-sm">{UI.swarms.contextualLoading}</p>;
  }

  if (swarms.length === 0) {
    return (
      <div className="ct-stack-xs">
        <p className="ct-placeholder ct-placeholder-sm">
          {error ?? UI.swarms.contextualEmpty}
        </p>
        <Link href="/swarms/new" className="ct-btn ct-btn-secondary ct-link-btn-sm">
          {UI.swarms.contextualCta}
        </Link>
      </div>
    );
  }

  const selectedSwarm = swarms.find((s) => s.id === selectedId);

  return (
    <div className="ct-stack-sm">
      <select
        className="crm-input ct-select-mb"
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
        <SwarmKickoffPanel swarmId={selectedSwarm.id} swarmName={selectedSwarm.name} />
      )}
    </div>
  );
}
