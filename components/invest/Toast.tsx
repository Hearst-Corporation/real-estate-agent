/**
 * Toast — confirmation non bloquante (succès/erreur). Présentation pure
 * (server component) ; l'orchestration d'apparition/auto-dismiss relève d'un
 * provider client. `role="status"` (succès) / `role="alert"` (erreur).
 */
import type { ReactNode } from "react";
import { IconCheck, IconWarning } from "./icons";

export type ToastTone = "success" | "error" | "info";

const TONE_CLASS: Record<ToastTone, string> = {
  success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  error: "border-red-400/30 bg-red-500/10 text-red-200",
  info: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
};

export function Toast({ tone = "info", children }: { tone?: ToastTone; children: ReactNode }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg shadow-black/20 backdrop-blur-sm ${TONE_CLASS[tone]}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "error" ? (
        <IconWarning className="size-5 shrink-0" />
      ) : (
        <IconCheck className="size-5 shrink-0" />
      )}
      <span>{children}</span>
    </div>
  );
}
