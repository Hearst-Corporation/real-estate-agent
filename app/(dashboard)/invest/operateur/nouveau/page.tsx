/**
 * BACK-OFFICE OPÉRATEUR — wizard de création d'un deal. RSC garde + wizard client.
 */
import Link from "next/link";
import { PageStack, PageHeader, Sub } from "@/components/cockpit/primitives";
import { Banner } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { fetchOperatorDeals } from "../../_data/server";
import { CreateDealWizard } from "./CreateDealWizard";

export const dynamic = "force-dynamic";

const n = UI.invest.operator.nouveau;

export default async function NouveauDealPage() {
  const { authorized, configured } = await fetchOperatorDeals();

  return (
    <PageStack>
      <Link href="/invest/operateur" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        {n.backLink}
      </Link>
      <PageHeader kicker={n.eyebrow} title={n.title} meta={<Sub>{n.sub}</Sub>} />

      {!configured ? (
        <Banner tone="warn">{n.dbUnavailable}</Banner>
      ) : !authorized ? (
        <Banner tone="warn">{n.unauthorized}</Banner>
      ) : (
        <CreateDealWizard />
      )}
    </PageStack>
  );
}
