import { PageStack, PageHeader, Card } from "@/components/cockpit/primitives";
import { Skeleton } from "@/components/cockpit/Skeleton";
import { UI } from "@/lib/ui-strings";

/**
 * État de chargement du segment (dashboard). Composant synchrone (pas async) :
 * rend des Skeleton qui miment la forme de page (header + carte de contenu).
 */
export default function DashboardLoading() {
  return (
    <PageStack>
      <PageHeader kicker="Cockpit" title={UI.common.loading} />
      <Card>
        <div className="ct-skeleton-stack" aria-busy="true">
          <Skeleton width="40%" height={20} />
          <Skeleton width="100%" height={14} />
          <Skeleton width="90%" height={14} />
          <Skeleton width="70%" height={14} />
        </div>
      </Card>
    </PageStack>
  );
}
