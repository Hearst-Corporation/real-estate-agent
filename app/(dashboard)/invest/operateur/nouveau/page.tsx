/**
 * BACK-OFFICE OPÉRATEUR — wizard de création d'un deal. RSC garde + wizard client.
 */
import Link from "next/link";
import { ChevronLeftIcon } from "@heroicons/react/20/solid";
import { PageStack } from "@/components/cockpit/primitives";
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
      <Link
        href="/invest/operateur"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
      >
        <ChevronLeftIcon aria-hidden="true" className="size-4" />
        {n.backLink}
      </Link>

      {/* Page heading — TW+ headings__page-headings/03-with-meta-and-actions (adapté sombre) */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">{n.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{n.title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">{n.sub}</p>
      </div>

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
