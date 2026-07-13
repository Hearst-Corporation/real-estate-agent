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
  // Scanne les sections <section class="page|sheet ...">. La zone réserves /
  // mentions légales (.reserves-section, en fin de page) est volontairement
  // EXEMPTÉE : on tronque chaque section au premier marqueur de réserves, de
  // sorte qu'une page mêlant contenu principal + mentions reste protégée sur
  // sa partie principale uniquement.
  const sections: string[] = [];
  const re = /<section[^>]*class="(?:sheet|page)[^"]*"[^>]*>([\s\S]*?)<\/section>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const inner = match[1].split(/reserves-section|res-title|reserve-item/)[0];
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

// ── Échappement HTML (contenu contrôlé par le vendeur → jamais brut dans le <head>) ──
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Rendu HTML complet ────────────────────────────────────────────────────────
export function renderBrochureHtml(estimation: Estimation): string {
  const innerMarkup = renderToStaticMarkup(
    React.createElement(Brochure, { estimation })
  );

  // L'adresse vient de l'entretien (donnée vendeur) : elle est interpolée dans
  // le <title> HORS du rendu React → on l'échappe manuellement (sinon injection
  // de balises dans le <head>).
  const titleAddr = escapeHtml(estimation.property.adresse ?? 'Brochure');

  const raw = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Avis de Valeur — ${titleAddr}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
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
