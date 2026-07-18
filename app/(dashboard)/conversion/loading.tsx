import { PageStack, PageHeader, Card } from "@/components/cockpit/primitives";
import { Skeleton } from "@/components/cockpit/Skeleton";
import { CONVERSION_UI } from "@/lib/conversion/strings";

export default function ConversionLoading() {
  return (
    <PageStack>
      <PageHeader kicker={CONVERSION_UI.navLabel} title={CONVERSION_UI.title} meta={CONVERSION_UI.subtitle} />
      <Card>
        <Skeleton width="60%" height={16} />
      </Card>
      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[1.4fr_1fr]" aria-busy="true">
        <Card>
          <Skeleton width="40%" height={18} />
          <Skeleton width="100%" height={180} radius={16} className="mt-3" />
        </Card>
        <Card>
          <Skeleton width="40%" height={18} />
          <Skeleton width="100%" height={120} radius={16} className="mt-3" />
        </Card>
      </div>
    </PageStack>
  );
}
