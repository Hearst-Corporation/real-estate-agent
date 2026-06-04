import type { Metadata } from "next";
import "./globals.css";
import "./cockpit.css";
import { UI } from "@/lib/ui-strings";

export const metadata: Metadata = {
  title: UI.app.name,
  description: UI.app.description,
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
