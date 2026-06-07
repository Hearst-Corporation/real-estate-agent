import { PageHeader, PageStack } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { TAB_GROUPS } from "@/config/nav";
import { UI } from "@/lib/ui-strings";
import { PropertyForm } from "../_components/PropertyForm";

export default function NewPropertyPage() {
  const t = UI.properties;
  return (
    <PageStack>
      <PageHeader
        kicker={t.eyebrow}
        title={t.newCta}
        nav={<PageNavTabs tabs={TAB_GROUPS.portefeuille} />}
      />
      <PropertyForm />
    </PageStack>
  );
}
