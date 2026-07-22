/**
 * /brochure/[token] — Page publique de consultation d'un avis de valeur partagé.
 *
 * Accessible SANS session. L'autorisation est portée par le token signé.
 * Hors (dashboard) → pas de shell Cockpit. Le root layout applique cockpit.css
 * mais l'iframe isole visuellement la brochure PDF.
 */

import { notFound } from "next/navigation";
import { verifyShareToken } from "@/lib/estimation/share";
import { getGpu1Admin } from "@/lib/gpu1";
import { UI } from "@/lib/ui-strings";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function BrochurePage({ params }: Props) {
  const { token } = await params;

  // ── Vérifier le token ─────────────────────────────────────────────────────
  const verified = await verifyShareToken(token);
  if (!verified) notFound();

  // ── Vérifier que l'estimation existe et est "ready" ───────────────────────
  const sb = getGpu1Admin();
  if (!sb) notFound();

  const { data: row } = await sb
    .from("estimations")
    .select("id, status")
    .eq("id", verified.estimationId)
    .maybeSingle();

  if (row?.status !== "ready") notFound();

  const pdfSrc = `/api/brochure/${encodeURIComponent(token)}/pdf`;

  return (
    <html lang="fr" className="brochure-host">
      <head>
        <meta charSet="utf-8" />
        {/* Brochure = lien de partage privé porteur de PII : jamais indexée. */}
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{UI.brochure.docTitle}</title>
        <style>{`
          * { box-sizing: border-box; }
          html.brochure-host, html.brochure-host body {
            margin: 0; padding: 0; height: 100%;
            background: #020617;
          }
          /* 100dvh : suit la hauteur visible réelle (corrige la barre d'URL iOS Safari). */
          .brochure-frame { display: block; width: 100%; height: 100dvh; border: none; }
          /* Repli mobile : Safari iOS n'affiche pas un PDF dans une iframe. */
          .brochure-fallback {
            display: none; padding: 1rem; text-align: center;
            font-family: system-ui, -apple-system, sans-serif; color: rgba(226, 232, 240, 0.72);
          }
          .brochure-fallback a { color: #a5b4fc; font-weight: 600; }
          @media (max-width: 820px), (pointer: coarse) {
            .brochure-fallback { display: block; }
          }
        `}</style>
      </head>
      <body>
        <iframe
          className="brochure-frame"
          src={pdfSrc}
          title={UI.brochure.iframeTitle}
          allowFullScreen
        />
        <p className="brochure-fallback">
          {UI.brochure.mobileHint}{" "}
          <a href={pdfSrc} target="_blank" rel="noopener noreferrer">
            {UI.brochure.openPdf}
          </a>
        </p>
      </body>
    </html>
  );
}
