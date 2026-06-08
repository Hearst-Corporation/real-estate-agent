import { PageHeader, PageStack } from "@/components/cockpit/primitives";
import { UI } from "@/lib/ui-strings";
import { PropertyForm } from "../_components/PropertyForm";

export default function NewPropertyPage() {
  const t = UI.properties;
  // Page de création : pas d'onglets de navigation portefeuille (on ne navigue
  // pas, on saisit) → header plus court, focus sur le formulaire.
  return (
    <PageStack>
      <PageHeader kicker={t.eyebrow} title={t.newCta} />
      <PropertyForm />
    </PageStack>
  );
}
