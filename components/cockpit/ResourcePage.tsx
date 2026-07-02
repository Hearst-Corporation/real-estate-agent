import type { ReactNode } from "react";
import { PageStack, PageHeader, Card } from "@/components/cockpit/primitives";

/** Page ressource CRUD : compose `PageStack` + `PageHeader` (kicker/titre/tabs/action/kpis) + `Card` (contenu). Server-component compatible. */
export function CockpitResourcePage({
  kicker,
  title,
  tabs,
  action,
  kpis,
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  tabs?: ReactNode;
  action?: ReactNode;
  kpis?: { label: string; value: ReactNode }[];
  children: ReactNode;
}) {
  return (
    <PageStack>
      <PageHeader kicker={kicker} title={title} nav={tabs} action={action} kpis={kpis} />
      <Card>{children}</Card>
    </PageStack>
  );
}
