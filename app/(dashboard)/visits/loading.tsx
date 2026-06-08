import { PageStack, PageHeader, Card } from "@/components/cockpit/primitives";
import { Skeleton } from "@/components/cockpit/Skeleton";
import { UI } from "@/lib/ui-strings";

export default function VisitsLoading() {
  return (
    <PageStack>
      <PageHeader kicker={UI.visits.eyebrow} title={UI.visits.title} />
      <div className="ct-loading-grid" aria-busy="true">
        <Card>
          <Skeleton width="50%" height={18} />
          <Skeleton width="100%" height={120} radius="var(--ct-radius-lg)" />
        </Card>
        <Card>
          <Skeleton width="50%" height={18} />
          <Skeleton width="100%" height={120} radius="var(--ct-radius-lg)" />
        </Card>
      </div>
      <Card>
        <div className="ct-skeleton-stack" aria-busy="true">
          <Skeleton width="100%" height={16} />
          <Skeleton width="100%" height={16} />
          <Skeleton width="80%" height={16} />
        </div>
      </Card>
    </PageStack>
  );
}
