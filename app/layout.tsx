import type { Metadata } from "next";
import "./globals.css";
import "./cockpit.css";

export const metadata: Metadata = {
  title: "Real estate Agent",
  description: "Real estate Agent — Cockpit",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // data-product = seul switch d'accent autorisé (défaut). L'AccentSelector le surcharge côté client.
  return (
    <html lang="fr" data-product="default">
      <body>{children}</body>
    </html>
  );
}
