import { PageStack, PageHeader, Card } from "@/components/cockpit/primitives";
import { Skeleton } from "@/components/cockpit/Skeleton";
import { UI } from "@/lib/ui-strings";

export default function VisitsLoading() {
  return (
    <PageStack>
      <PageHeader kicker={UI.visits.eyebrow} title={UI.visits.title} />
      <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2" aria-busy="true">
        <Card>
          <Skeleton width="50%" height={18} />
          <Skeleton width="100%" height={120} radius={16} className="mt-3" />
        </Card>
        <Card>
          <Skeleton width="50%" height={18} />
          <Skeleton width="100%" height={120} radius={16} className="mt-3" />
        </Card>
      </div>
      <Card>
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton width="100%" height={16} />
          <Skeleton width="100%" height={16} />
          <Skeleton width="80%" height={16} />
        </div>
      </Card>
    </PageStack>
  );
}
