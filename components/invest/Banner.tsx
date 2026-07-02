/**
 * Banner — bandeau d'état transverse (warn / info / danger / success).
 * Server component. Usage : état partiel/dégradé, disclaimer anti-NAV (L2),
 * rappel "non garanti" (L5). `role="note"` (ou "alert" pour danger).
 */
import type { ReactNode } from "react";
import { IconWarning, IconInfo, IconCheck } from "./icons";

export type BannerTone = "warn" | "info" | "danger" | "success";

const TONE_CLASS: Record<BannerTone, string> = {
  warn: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  info: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  danger: "border-red-400/30 bg-red-500/10 text-red-200",
  success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
};

function Glyph({ tone }: { tone: BannerTone }) {
  if (tone === "success") return <IconCheck className="size-5 shrink-0" />;
  if (tone === "info") return <IconInfo className="size-5 shrink-0" />;
  return <IconWarning className="size-5 shrink-0" />;
}

export function Banner({ tone = "info", children }: { tone?: BannerTone; children: ReactNode }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${TONE_CLASS[tone]}`}
      role={tone === "danger" ? "alert" : "note"}
    >
      <Glyph tone={tone} />
      <div>{children}</div>
    </div>
  );
}
