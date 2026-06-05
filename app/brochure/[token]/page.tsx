/**
 * /brochure/[token] — Page publique de consultation d'un avis de valeur partagé.
 *
 * Accessible SANS session. L'autorisation est portée par le token signé.
 * Hors (dashboard) → pas de shell Cockpit. Le root layout applique cockpit.css
 * mais l'iframe isole visuellement la brochure PDF.
 */

import { notFound } from "next/navigation";
import { verifyShareToken } from "@/lib/estimation/share";
import { getSupabaseAdmin } from "@/lib/server/supabase";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function BrochurePage({ params }: Props) {
  const { token } = await params;

  // ── Vérifier le token ─────────────────────────────────────────────────────
  const verified = await verifyShareToken(token);
  if (!verified) notFound();

  // ── Vérifier que l'estimation existe et est "ready" ───────────────────────
  const sb = getSupabaseAdmin();
  if (!sb) notFound();

  const { data: row } = await sb
    .from("estimations")
    .select("id, status")
    .eq("id", verified.estimationId)
    .maybeSingle();

  if (!row || row.status !== "ready") notFound();

  const pdfSrc = `/api/brochure/${encodeURIComponent(token)}/pdf`;

  return (
    <html lang="fr" style={{ margin: 0, padding: 0, height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Avis de valeur</title>
        <style>{`
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; height: 100%; background: #1a1a1a; }
          iframe { display: block; width: 100%; height: 100vh; border: none; }
        `}</style>
      </head>
      <body>
        <iframe
          src={pdfSrc}
          title="Avis de valeur immobilière"
          allowFullScreen
        />
      </body>
    </html>
  );
}
