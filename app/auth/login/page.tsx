import { Suspense } from "react";
import { Eyebrow, Title, Sub, Card } from "@/components/cockpit/primitives";
import { Logo } from "@/components/cockpit/Logo";
import { UI } from "@/lib/ui-strings";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  const t = UI.login;
  return (
    <main className="ct-login-shell">
      <div className="ct-login-card">
        <div className="ct-login-logo">
          <Logo size={28} />
        </div>
        <div className="ct-text-center">
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <Title>{t.title}</Title>
          <Sub>{t.sub}</Sub>
        </div>
        <Card>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </Card>
      </div>
    </main>
  );
}
