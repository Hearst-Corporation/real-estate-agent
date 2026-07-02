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
    <div className="relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none select-none blur-sm" aria-hidden>
        {children}
      </div>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-6 text-center backdrop-blur-sm"
        role="note"
      >
        <IconLock className="size-6 text-slate-300" />
        <p className="max-w-xs text-sm text-slate-300">{message}</p>
        {cta}
      </div>
    </div>
  );
}
