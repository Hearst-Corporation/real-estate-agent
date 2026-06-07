"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { UI } from "@/lib/ui-strings";
import RunReport from "@/components/swarms/RunReport";

export default function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const [ids, setIds] = useState<{ id: string; runId: string } | null>(null);

  useEffect(() => {
    params.then((p) => setIds({ id: p.id, runId: p.runId }));
  }, [params]);

  if (!ids) {
    return <div className="swarm-report-loading">{UI.common.loading}</div>;
  }

  return (
    <>
      <p className="ct-eyebrow">
        <Link href="/swarms" className="swarm-crumb">
          {UI.nav.swarms}
        </Link>
        {" / "}
        <Link href={`/swarms/${ids.id}`} className="swarm-crumb">
          {UI.swarms.backToSwarm}
        </Link>
        {" / "}
        {UI.swarms.runBreadcrumb}
      </p>
      <h1 className="ct-title swarm-run-page-title">{UI.swarms.runTitle}</h1>
      <RunReport swarmId={ids.id} runId={ids.runId} />
    </>
  );
}
