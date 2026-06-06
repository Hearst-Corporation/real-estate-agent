/**
 * Banner — bandeau d'état transverse (warn / info / danger / success).
 * Server component. Usage : état partiel/dégradé, disclaimer anti-NAV (L2),
 * rappel "non garanti" (L5). `role="note"` (ou "alert" pour danger).
 */
import type { ReactNode } from "react";
import { IconWarning, IconInfo, IconCheck } from "./icons";

export type BannerTone = "warn" | "info" | "danger" | "success";

function Glyph({ tone }: { tone: BannerTone }) {
  if (tone === "success") return <IconCheck className="inv-banner-ic" />;
  if (tone === "info") return <IconInfo className="inv-banner-ic" />;
  return <IconWarning className="inv-banner-ic" />;
}

export function Banner({ tone = "info", children }: { tone?: BannerTone; children: ReactNode }) {
  return (
    <div className={`inv-banner ${tone}`} role={tone === "danger" ? "alert" : "note"}>
      <Glyph tone={tone} />
      <div>{children}</div>
    </div>
  );
}
