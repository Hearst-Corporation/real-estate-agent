"use client";

import { useState, useEffect } from "react";
import { PageHeader, PageStack } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import RunReport from "@/components/swarms/RunReport";
import { Text, TextLink } from "@/components/ui/text";

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
    return <Text className="py-8 text-center">{UI.common.loading}</Text>;
  }

  return (
    <PageStack>
      <PageHeader
        kicker={
          <>
            <TextLink href="/swarms">{UI.nav.swarms}</TextLink>
            {" / "}
            <TextLink href={`/swarms/${ids.id}`}>{UI.swarms.backToSwarm}</TextLink>
            {" / "}
            {UI.swarms.runBreadcrumb}
          </>
        }
        title={UI.swarms.runTitle}
      />
      <RunReport swarmId={ids.id} runId={ids.runId} />
    </PageStack>
  );
}
