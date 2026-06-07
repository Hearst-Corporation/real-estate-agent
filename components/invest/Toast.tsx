/**
 * Toast — confirmation non bloquante (succès/erreur). Présentation pure
 * (server component) ; l'orchestration d'apparition/auto-dismiss relève d'un
 * provider client. `role="status"` (succès) / `role="alert"` (erreur).
 */
import type { ReactNode } from "react";
import { IconCheck, IconWarning } from "./icons";

export type ToastTone = "success" | "error" | "info";

export function Toast({ tone = "info", children }: { tone?: ToastTone; children: ReactNode }) {
  const cls = tone === "info" ? "" : tone;
  return (
    <div className={`inv-toast${cls ? ` ${cls}` : ""}`} role={tone === "error" ? "alert" : "status"}>
      {tone === "error" ? (
        <IconWarning className="inv-toast-ic" />
      ) : (
        <IconCheck className="inv-toast-ic" />
      )}
      <span>{children}</span>
    </div>
  );
}
