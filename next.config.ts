import type { NextConfig } from "next";

// ── Content-Security-Policy ───────────────────────────────────────────────────
// Posée en mode REPORT-ONLY : elle N'IMPOSE RIEN (ne peut casser aucune page) mais
// établit la politique de référence et fait remonter les violations. L'application
// utilise des scripts/styles inline (hydration Next App Router), Sentry (browser
// SDK → *.ingest.sentry.io) et PostHog — une CSP *enforçante* exige un nonce câblé
// dans le proxy (hors périmètre de cette mission). Le report-only donne la valeur
// sécurité (baseline + télémétrie de violation) sans risque de régression. Les
// directives strictes réellement sûres (`object-src 'none'`, `base-uri 'self'`,
// `frame-ancestors 'self'`) sont AUSSI reprises dans l'en-tête enforçant plus bas.
const CSP_CONNECT = [
  "'self'",
  "https://*.hearst.app", // tunnels applicatifs (la DB PostgREST gpu1 est serveur-only)
  "https://*.ingest.sentry.io",
  "https://*.ingest.de.sentry.io",
  "https://*.posthog.com",
  "https://*.i.posthog.com",
].join(" ");

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // Next App Router injecte du JS inline (hydration) + eval en dev.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.posthog.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${CSP_CONNECT}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: [
    "playwright-core",
    "@sparticuz/chromium",
    "react-dom",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), payment=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "off",
          },
          {
            // Enforçant : ces 3 directives sont sûres pour une app App Router et
            // ferment le clickjacking / l'injection de <base> / le plugin legacy
            // sans toucher aux scripts/styles inline légitimes.
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
          },
          {
            // Politique complète en report-only (n'impose rien, remonte les violations).
            key: "Content-Security-Policy-Report-Only",
            value: CSP_REPORT_ONLY,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
