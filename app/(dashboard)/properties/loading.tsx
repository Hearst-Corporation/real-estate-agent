import { PageStack, PageHeader, Card } from "@/components/cockpit/primitives";
import { Skeleton } from "@/components/cockpit/Skeleton";
import { UI } from "@/lib/ui-strings";

export default function PropertiesLoading() {
  return (
    <PageStack>
      <PageHeader kicker={UI.properties.eyebrow} title={UI.properties.title} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2" aria-busy="true">
        <Card>
          <div className="flex flex-col gap-3">
            <Skeleton width="50%" height={18} />
            <Skeleton width="100%" height={120} radius={16} />
          </div>
        </Card>
        <Card>
          <div className="flex flex-col gap-3">
            <Skeleton width="50%" height={18} />
            <Skeleton width="100%" height={120} radius={16} />
          </div>
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
