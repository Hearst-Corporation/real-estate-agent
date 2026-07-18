/**
 * /offmarket/[token] — Page PUBLIQUE d'une sélection off-market partagée.
 *
 * Accessible SANS session : l'autorisation est portée par le token signé.
 * Hors (dashboard) → pas de shell Cockpit. Affiche les biens de la sélection
 * avec leur score de matching réel et capture le feedback de l'acquéreur.
 *
 * token invalide/expiré, sélection absente/révoquée, ou tables non déployées
 * (migration 0050 non appliquée) → 404 (aucune fuite d'existence).
 */

import { notFound } from "next/navigation";
import { verifySelectionToken } from "@/lib/offmarket/share";
import { getGpu1Admin } from "@/lib/gpu1";
import { loadPublicSelection } from "@/lib/offmarket/db";
import { FeedbackButtons } from "./_components/FeedbackButtons";

interface Props {
  params: Promise<{ token: string }>;
}

function fmtEur(n: number | null): string {
  if (n == null) return "Prix sur demande";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export default async function OffmarketSelectionPage({ params }: Props) {
  const { token } = await params;

  const verified = await verifySelectionToken(token);
  if (!verified) notFound();

  const sb = getGpu1Admin();
  if (!sb) notFound();

  const result = await loadPublicSelection(sb, verified.selectionId);
  if (!result.ok) notFound(); // unavailable / not_found → 404 uniforme

  const { titre, items } = result.data;

  return (
    <html lang="fr" className="om-host">
      <head>
        <meta charSet="utf-8" />
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{titre}</title>
        <style>{`
          * { box-sizing: border-box; }
          html.om-host, html.om-host body { margin: 0; padding: 0; }
          html.om-host body {
            background: #f8fafc; color: #18181b;
            font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
            line-height: 1.5;
          }
          @media (prefers-color-scheme: dark) {
            html.om-host body { background: #0f172a; color: #e2e8f0; }
          }
          .om-wrap { max-width: 800px; margin: 0 auto; padding: 32px 16px 64px; }
          .om-head { margin-bottom: 24px; }
          .om-kicker { font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #b08d57; margin: 0 0 4px; }
          .om-title { font-size: 26px; font-weight: 700; margin: 0; }
          .om-sub { font-size: 14px; color: #71717a; margin: 8px 0 0; }
          @media (prefers-color-scheme: dark) { .om-sub { color: #94a3b8; } }
          .om-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
          .om-card {
            background: #fff; border: 1px solid rgba(24,24,27,.08); border-radius: 14px;
            padding: 20px; box-shadow: 0 1px 2px rgba(0,0,0,.04);
          }
          @media (prefers-color-scheme: dark) {
            .om-card { background: #1e293b; border-color: rgba(255,255,255,.08); box-shadow: none; }
          }
          .om-card-top { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
          .om-card-title { font-size: 17px; font-weight: 650; margin: 0; }
          .om-price { font-size: 17px; font-weight: 700; white-space: nowrap; }
          .om-meta { font-size: 13px; color: #71717a; margin: 6px 0 0; }
          @media (prefers-color-scheme: dark) { .om-meta { color: #94a3b8; } }
          .om-score { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; font-weight: 600; color: #3f6212; background: rgba(132,204,22,.14); padding: 3px 10px; border-radius: 999px; }
          @media (prefers-color-scheme: dark) { .om-score { color: #bef264; background: rgba(132,204,22,.15); } }
          .om-fb { margin-top: 16px; }
          .om-fb-row { display: flex; flex-wrap: wrap; gap: 8px; }
          .om-fb-btn {
            appearance: none; cursor: pointer; font-size: 14px; font-weight: 600;
            border: 1px solid rgba(24,24,27,.15); background: #fff; color: #27272a;
            border-radius: 10px; padding: 10px 16px; min-height: 44px;
          }
          .om-fb-btn:hover { border-color: rgba(24,24,27,.35); }
          .om-fb-btn:focus-visible { outline: 2px solid #b08d57; outline-offset: 2px; }
          .om-fb-btn:disabled { opacity: .55; cursor: default; }
          .om-fb-btn--active { background: #b08d57; border-color: #b08d57; color: #1c1917; }
          @media (prefers-color-scheme: dark) {
            .om-fb-btn { background: #0f172a; border-color: rgba(255,255,255,.18); color: #e2e8f0; }
            .om-fb-btn--active { background: #b08d57; border-color: #b08d57; color: #1c1917; }
          }
          .om-fb-ok { font-size: 13px; color: #15803d; margin: 8px 0 0; }
          .om-fb-err { font-size: 13px; color: #dc2626; margin: 8px 0 0; }
          .om-empty { font-size: 14px; color: #71717a; }
        `}</style>
      </head>
      <body>
        <main className="om-wrap">
          <header className="om-head">
            <p className="om-kicker">Sélection off-market</p>
            <h1 className="om-title">{titre}</h1>
            <p className="om-sub">
              Voici une sélection de biens qui pourraient vous intéresser. Donnez votre avis sur chacun.
            </p>
          </header>

          {items.length === 0 ? (
            <p className="om-empty">Cette sélection ne contient aucun bien pour le moment.</p>
          ) : (
            <ul className="om-list">
              {items.map((it) => {
                const meta = [
                  it.propertyType,
                  [it.postalCode, it.city].filter(Boolean).join(" "),
                  it.surface ? `${it.surface} m²` : null,
                  it.rooms ? `${it.rooms} pièces` : null,
                  it.dpe ? `DPE ${it.dpe}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                const feats = [
                  it.hasTerrace ? "Terrasse" : null,
                  it.hasParking ? "Parking" : null,
                  it.hasGarden ? "Jardin" : null,
                  it.hasPool ? "Piscine" : null,
                  it.hasElevator ? "Ascenseur" : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={it.itemId} className="om-card">
                    <div className="om-card-top">
                      <h2 className="om-card-title">{it.title ?? "Bien immobilier"}</h2>
                      <span className="om-price">{fmtEur(it.askingPrice)}</span>
                    </div>
                    {meta ? <p className="om-meta">{meta}</p> : null}
                    {feats ? <p className="om-meta">{feats}</p> : null}
                    {it.scoreMatch != null ? (
                      <span className="om-score">Correspondance {it.scoreMatch}/100</span>
                    ) : null}
                    <FeedbackButtons token={token} itemId={it.itemId} initialVerdict={it.verdict} />
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </body>
    </html>
  );
}
