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
    return <p className="ct-placeholder" style={{ fontSize: 12 }}>{UI.swarms.contextualLoading}</p>;
  }

  if (swarms.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-xs)" }}>
        <p className="ct-placeholder" style={{ fontSize: 12 }}>
          {UI.swarms.contextualEmpty}
        </p>
        <Link href="/swarms/new" className="ct-btn ct-btn-secondary" style={{ display: "inline-block", textDecoration: "none", fontSize: 12 }}>
          {UI.swarms.contextualCta}
        </Link>
      </div>
    );
  }

  const selectedSwarm = swarms.find((s) => s.id === selectedId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ct-space-sm)" }}>
      <select
        className="crm-input"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        style={{ marginBottom: "var(--ct-space-xs)" }}
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
