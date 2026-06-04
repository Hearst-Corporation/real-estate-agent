import { Suspense } from "react";
import { Eyebrow, Title, Sub, Card } from "@/components/cockpit/primitives";
import { Logo } from "@/components/cockpit/Logo";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="ct-login-shell">
      <div className="ct-login-card">
        <div className="ct-login-logo">
          <Logo size={28} />
        </div>
        <div style={{ textAlign: "center" }}>
          <Eyebrow>Connexion</Eyebrow>
          <Title>Real estate Agent</Title>
          <Sub>Identifiants requis pour accéder au dashboard.</Sub>
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
