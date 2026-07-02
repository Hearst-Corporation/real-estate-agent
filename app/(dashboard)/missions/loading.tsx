import { PageStack, PageHeader, Card } from "@/components/cockpit/primitives";
import { Skeleton } from "@/components/cockpit/Skeleton";
import { UI } from "@/lib/ui-strings";

export default function MissionsLoading() {
  return (
    <PageStack>
      <PageHeader kicker={UI.missions.kicker} title={UI.nav.missions} />
      <Card title={UI.missions.launchTitle}>
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton width="100%" height={80} radius={16} />
          <Skeleton width="40%" height={36} radius={12} />
        </div>
      </Card>
      <Card title={UI.missions.listTitle}>
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton width="100%" height={16} />
          <Skeleton width="90%" height={16} />
          <Skeleton width="70%" height={16} />
        </div>
      </Card>
    </PageStack>
  );
}
