import { Suspense } from "react";
import { Logo } from "@/components/cockpit/Logo";
import { UI } from "@/lib/ui-strings";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  const t = UI.login;
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-lin-brut px-6 py-12">
      {/* Halo accent décoratif — discret sur fond clair (charte Remparts) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[520px] w-[820px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent-500/10 blur-3xl"
      />
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl border border-zinc-950/10 bg-white text-accent-500 shadow-sm">
            <Logo size={28} />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-accent-500">
              {t.eyebrow}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{t.title}</h1>
            <p className="text-sm text-zinc-500">{t.sub}</p>
          </div>
        </div>

        <div className="mt-8">
          <section className="rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-sm">
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </section>
        </div>
      </div>
    </main>
  );
}
