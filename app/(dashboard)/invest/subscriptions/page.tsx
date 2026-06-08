/**
 * MES SOUSCRIPTIONS (Epic 1.3, P5). RSC shell + liste client.
 *
 * Précharge les souscriptions du caller côté serveur (service-role filtré
 * user_id + tenant_id, I9) puis monte la liste interactive (StatusPill par état +
 * actions contextuelles : signer / annuler pendant le délai de réflexion 4j).
 *
 * Anti-FIA : une souscription `reserved` est une réservation non engageante, sans
 * versement ; les fonds transitent par un séquestre tiers (jamais la plateforme) ;
 * vous êtes créancier ; tout rendement est une cible non garantie, avec un risque
 * de perte en capital. (Voir lint:legal.)
 */

import { PageStack, PageHeader, Sub } from "@/components/cockpit/primitives";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { Banner } from "@/components/invest";
import {
  supabaseSubscriptionStore,
  listMySubscriptions,
  type SubscriptionView,
} from "@/lib/invest/subscription";
import { SubscriptionsList } from "./_components/SubscriptionsList";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let initial: SubscriptionView[] = [];
  let configured = true;
  if (!sb) {
    configured = false;
  } else if (claims) {
    try {
      initial = await listMySubscriptions(supabaseSubscriptionStore(), {
        userId: claims.sub,
        tenantId: tenantOf(claims),
      });
    } catch {
      initial = [];
    }
  }

  return (
    <PageStack>
      <PageHeader
        kicker="Invest · Souscriptions"
        title="Mes souscriptions"
        meta={
          <Sub>
            Suivez l&apos;état de vos souscriptions : réservation non engageante, signature, versement en
            séquestre tiers. Vous prêtez à une société (vous êtes créancier) ; tout rendement est une cible
            non garantie et comporte un risque de perte en capital.
          </Sub>
        }
      />

      {!configured ? (
        <Banner tone="warn">
          Service indisponible pour le moment. Vos souscriptions s&apos;afficheront une fois la connexion
          rétablie.
        </Banner>
      ) : (
        <SubscriptionsList initial={initial} />
      )}
    </PageStack>
  );
}
