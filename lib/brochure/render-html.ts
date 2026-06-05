// render-html.ts — Rendu HTML complet de la brochure, autonome du DS Cockpit.
// N'importe AUCUN cockpit.css / globals.css.
//
// Firewall de contenu (sections 1–8) :
//   - En dev (NODE_ENV !== 'production') : throw si une chaîne interdite est détectée.
//   - En prod : supprime la ligne incriminée.
//   - §9 Réserves est volontairement exclu du firewall car "à confirmer" y est intentionnel.

import React from 'react';
import type { Estimation } from '@/lib/estimation/types';
import { Brochure } from '@/components/brochure/Brochure';
import { BROCHURE_CSS } from '@/components/brochure/brochure-css';

// Lazy require to prevent Turbopack from statically analyzing react-dom/server
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');

// ── Patterns interdits dans les sections 1–8 ─────────────────────────────────
const FORBIDDEN_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /points?\s+de\s+vigilance/i,         label: 'points de vigilance' },
  { re: /avis\s+indicatif/i,                 label: 'avis indicatif' },
  { re: /estimation\s+r[ée]alis[ée]e\s+le/i, label: 'estimation réalisée le' },
  { re: /\b(confiance|score)\b/i,            label: 'confiance/score' },
  { re: /à\s+confirmer/i,                    label: 'à confirmer' },
];

// ── Extraction du corps sections 1–8 (tout sauf §9 Réserves) ─────────────────
// La §9 Réserves est marquée par le commentaire <!-- §9 Réserves --> dans le rendu.
// On considère que tout contenu dans une <section> contenant "reserve" ou "reserves-section"
// appartient à la §9 et est exclu du firewall.
function extractMainBody(html: string): string {
  // Découpe le HTML en sections ; conserve tout sauf les sections de réserves.
  // Approche simple : regex sur les blocs <section class="sheet ..."> ... </section>.
  // La §9 contient la classe "reserves-section" dans son contenu.
  // On extrait les sections en stack (non-nested ici).
  const sections: string[] = [];
  const re = /<section[^>]*class="sheet[^"]*"[^>]*>([\s\S]*?)<\/section>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const inner = match[1];
    // §9 : contient reserves-section ou res-title → exclure du firewall
    if (/reserves-section|res-title|reserve-item/.test(inner)) continue;
    sections.push(inner);
  }
  return sections.join('\n');
}

// ── Firewall ──────────────────────────────────────────────────────────────────
function applyFirewall(html: string): string {
  const mainBody = extractMainBody(html);

  for (const { re, label } of FORBIDDEN_PATTERNS) {
    if (re.test(mainBody)) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `[Brochure firewall] Chaîne interdite détectée dans les sections 1–8 : « ${label} ».\n` +
          `Vérifier le composant Brochure.tsx.`
        );
      } else {
        // En prod : supprime les lignes contenant la chaîne dans le HTML complet
        // (sauf dans les blocs de réserves)
        html = html
          .split('\n')
          .map((line) => (re.test(line) && !/(reserves-section|res-title|reserve-item)/.test(line) ? '' : line))
          .join('\n');
      }
    }
  }

  return html;
}

// ── Rendu HTML complet ────────────────────────────────────────────────────────
export function renderBrochureHtml(estimation: Estimation): string {
  const innerMarkup = renderToStaticMarkup(
    React.createElement(Brochure, { estimation })
  );

  const raw = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Avis de Valeur — ${estimation.property.adresse ?? 'Brochure'}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&family=Hanken+Grotesk:wght@300;400;500;600&display=swap" rel="stylesheet" />
<style>
${BROCHURE_CSS}
</style>
</head>
<body>
<div class="brochure-root">
${innerMarkup}
</div>
</body>
</html>`;

  return applyFirewall(raw);
}
