import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { UI } from "@/lib/ui-strings";
import PostHogProvider from "@/components/providers/PostHogProvider";
import WebVitals from "@/components/WebVitals";

// Satoshi Variable — fonte canonique du Cockpit, self-hostée (Fontshare FFL).
// Une seule fonte pour tout le produit (corps + titres).
const satoshi = localFont({
  src: "../public/fonts/Satoshi-Variable.woff2",
  variable: "--font-satoshi",
  weight: "300 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: UI.app.name,
  description: UI.app.description,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={satoshi.variable}>
      <body>
        <PostHogProvider>
          <WebVitals />
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
