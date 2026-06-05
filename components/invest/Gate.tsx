/**
 * Gate — overlay flouté sur du contenu sensible non débloqué (KYC/wallet
 * manquant). Server component. Le contenu reste dans le DOM mais flouté +
 * non interactif ; un overlay porte le CTA de déblocage. Ne bloque jamais la
 * navigation (étude : flou sur les chiffres KIIS tant que KYC non fait).
 */
import type { ReactNode } from "react";
import { IconLock } from "./icons";

export function Gate({
  locked,
  message,
  cta,
  children,
}: {
  locked: boolean;
  message: string;
  cta?: ReactNode;
  children: ReactNode;
}) {
  if (!locked) return <>{children}</>;
  return (
    <div className="inv-gate">
      <div className="inv-gate-content" aria-hidden>
        {children}
      </div>
      <div className="inv-gate-overlay" role="note">
        <IconLock className="inv-gate-ic" />
        <p className="inv-gate-msg">{message}</p>
        {cta}
      </div>
    </div>
  );
}
