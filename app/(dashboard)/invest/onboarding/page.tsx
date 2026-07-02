/**
 * ONBOARDING investisseur (Epic 1.1, écran WF-2/3). RSC + wizard client.
 *
 * Précharge le profil existant (server, service-role filtré user_id + tenant_id)
 * et monte le wizard interactif. Si Supabase/session indisponibles, on monte le
 * wizard sans profil initial (il créera le profil au premier "Continuer").
 *
 * Accent gold hérité du sous-layout /invest. Anti-FIA : ce parcours débloque la
 * capacité de souscrire (créancier), il ne place aucun argent ; tout rendement
 * est non garanti, le capital comporte un risque, les fonds passent par un
 * séquestre tiers. (Voir lint:legal.)
 */

import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { supabaseInvestorStore, getOrCreateProfile } from "@/lib/invest/investor";
import { OnboardingWizard } from "./_components/OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let initialProfile = null;
  if (claims && sb) {
    try {
      const p = await getOrCreateProfile(supabaseInvestorStore(), {
        userId: claims.sub,
        tenantId: tenantOf(claims),
      });
      initialProfile = {
        id: p.id,
        fullName: p.fullName,
        country: p.country,
        investorKind: p.investorKind,
        investorClass: p.investorClass,
        appropriatenessTestPassed: p.appropriatenessTestPassed,
        annualInvestmentCapCents: p.annualInvestmentCapCents,
        kycStatus: p.kycStatus,
        walletAddress: p.walletAddress,
      };
    } catch {
      initialProfile = null; // dégradé : le wizard recrée au premier pas.
    }
  }

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* En-tête — application-ui/headings__page-headings/01-with-actions (adapté sombre) */}
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
          Invest · Onboarding
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Devenir investisseur
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Quatre étapes pour débloquer la souscription : profil, test ECSP, vérification d&apos;identité et
          wallet. Vous prêtez à une société (vous êtes créancier) ; aucun argent n&apos;est placé ici.
        </p>
      </div>

      <OnboardingWizard initialProfile={initialProfile} />
    </div>
  );
}
