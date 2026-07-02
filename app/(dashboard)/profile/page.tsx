import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { LogoutButton } from "@/components/cockpit/LogoutButton";
import { IntegrationsPanel } from "./_components/IntegrationsPanel";
import { MfaPanel } from "./_components/MfaPanel";
import { UI } from "@/lib/ui-strings";

export default async function ProfilePage() {
  const claims = await getSession();
  if (!claims) redirect("/auth/login");

  const t = UI.profile;
  const issued = claims.iat ? new Date(claims.iat * 1000).toLocaleString("fr-FR") : t.empty;

  const identityRows = [
    { key: t.fields.email, value: claims.email ?? t.empty },
    { key: t.fields.userId, value: claims.sub },
    { key: t.fields.tenant, value: claims.tenant_id },
    { key: t.fields.role, value: claims.role },
    { key: t.fields.issued, value: issued },
  ];

  const scopes = claims.scope ?? [];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Page header — headings__page-headings/01-with-actions (adapté sombre) */}
      <div className="flex flex-col gap-1 pb-2">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
          {t.eyebrow}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t.title}</h1>
        <p className="mt-1 text-sm text-slate-400">{t.sub}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-3">
        {/* Identité — data-display__description-lists/02-left-aligned-in-card (adapté sombre) */}
        <div className="@4xl:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20 backdrop-blur-sm">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-base font-semibold text-white">{t.identityTitle}</h3>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Informations de session en cours.
              </p>
            </div>
            <div className="border-t border-white/10">
              <dl className="divide-y divide-white/10">
                {identityRows.map((row) => (
                  <div
                    key={row.key}
                    className="px-4 py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"
                  >
                    <dt className="text-sm font-medium text-slate-300">{row.key}</dt>
                    <dd className="mt-1 text-sm text-slate-100 sm:col-span-2 sm:mt-0">
                      <code className="break-all font-mono text-xs text-slate-200">{row.value}</code>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>

        {/* Colonne latérale — scopes / session / admin */}
        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-slate-100">{t.scopesTitle}</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {scopes.length === 0 ? (
                <span className="text-sm text-slate-500">{t.empty}</span>
              ) : (
                scopes.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-200"
                  >
                    {s}
                  </span>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-slate-100">{t.sessionTitle}</h3>
            <p className="mt-2 mb-3 text-sm text-slate-400">{t.sessionHint}</p>
            <LogoutButton variant="full" />
          </section>

          {claims.role === "admin" && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
              <h3 className="text-sm font-semibold text-slate-100">{UI.nav.admin}</h3>
              <p className="mt-2 mb-3 text-sm text-slate-400">
                Console d&apos;administration : fournisseurs, observabilité, données tenant.
              </p>
              <Link
                href="/admin"
                className="inline-flex items-center rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
              >
                {UI.nav.admin}
              </Link>
            </section>
          )}
        </div>
      </div>

      {/* 2FA — panneau métier intact */}
      <MfaPanel />

      {/* Intégrations — headings__section-headings + panneau métier intact */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-slate-100">{t.integrationsTitle}</h2>
        <p className="mt-1 mb-4 text-sm text-slate-400">{t.integrationsHint}</p>
        <IntegrationsPanel />
      </section>
    </div>
  );
}
