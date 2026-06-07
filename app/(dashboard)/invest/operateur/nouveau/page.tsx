/**
 * BACK-OFFICE OPÉRATEUR — wizard de création d'un deal. RSC garde + wizard client.
 */
import Link from "next/link";
import { Eyebrow, Title, Sub } from "@/components/cockpit/primitives";
import { Banner } from "@/components/invest";
import { UI } from "@/lib/ui-strings";
import { fetchOperatorDeals } from "../../_data/server";
import { CreateDealWizard } from "./CreateDealWizard";

export const dynamic = "force-dynamic";

const n = UI.invest.operator.nouveau;

export default async function NouveauDealPage() {
  const { authorized, configured } = await fetchOperatorDeals();

  return (
    <div className="ct-page-area">
      <Link href="/invest/operateur" className="inv-deal-loc inv-mb-md">
        {n.backLink}
      </Link>
      <Eyebrow>{n.eyebrow}</Eyebrow>
      <Title>{n.title}</Title>
      <Sub>{n.sub}</Sub>

      {!configured ? (
        <Banner tone="warn">{n.dbUnavailable}</Banner>
      ) : !authorized ? (
        <Banner tone="warn">{n.unauthorized}</Banner>
      ) : (
        <CreateDealWizard />
      )}
    </div>
  );
}
