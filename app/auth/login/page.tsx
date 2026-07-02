import { Suspense } from "react";
import { Eyebrow, Title, Sub, Card } from "@/components/cockpit/primitives";
import { Logo } from "@/components/cockpit/Logo";
import { UI } from "@/lib/ui-strings";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  const t = UI.login;
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-6 py-12">
      {/* Halo indigo décoratif — cohérent avec le glassmorphism du thème dark, même hors shell */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[520px] w-[820px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-indigo-500/20 blur-3xl"
      />
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-indigo-300 backdrop-blur-xl">
            <Logo size={28} />
          </span>
          <div>
            <Eyebrow>{t.eyebrow}</Eyebrow>
            <Title>{t.title}</Title>
            <Sub>{t.sub}</Sub>
          </div>
        </div>

        <div className="mt-8">
          <Card>
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </Card>
        </div>
      </div>
    </main>
  );
}
