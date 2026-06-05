/**
 * BACK-OFFICE OPÉRATEUR — wizard de création d'un deal. RSC garde + wizard client.
 *
 * Garde serveur (opérateur/admin) : on réutilise `fetchOperatorDeals` pour le
 * contrôle d'accès (authorized). Le formulaire lui-même est un client component
 * (`CreateDealWizard`) qui POSTe vers /api/invest/deals.
 */
import Link from "next/link";
import { Eyebrow, Title, Sub } from "@/components/cockpit/primitives";
import { Banner } from "@/components/invest";
import { fetchOperatorDeals } from "../../_data/server";
import { CreateDealWizard } from "./CreateDealWizard";

export const dynamic = "force-dynamic";

export default async function NouveauDealPage() {
  const { authorized, configured } = await fetchOperatorDeals();

  return (
    <div className="ct-page-area">
      <Link href="/invest/operateur" className="inv-deal-loc" style={{ marginBottom: "var(--ct-space-md)" }}>
        ‹ Mes opérations
      </Link>
      <Eyebrow>Invest · Back-office opérateur</Eyebrow>
      <Title>Nouveau deal</Title>
      <Sub>Créez un SPV (SAS) dédié + sa tranche obligataire. Le deal naît en brouillon ; la publication exige un KIIS publié.</Sub>

      {!configured ? (
        <Banner tone="warn">Base de données non configurée — création indisponible.</Banner>
      ) : !authorized ? (
        <Banner tone="warn">
          Accès réservé aux opérateurs et administrateurs. Investir comporte un risque de perte en
          capital ; tout rendement est une cible non garantie.
        </Banner>
      ) : (
        <CreateDealWizard />
      )}
    </div>
  );
}
