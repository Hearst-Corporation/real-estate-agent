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
  // data-product = seul switch d'accent autorisé. Posé en dur sur la racine ;
  // les sous-sections (ex. invest = "gold") surchargent via leur propre wrapper.
  return (
    <html lang="fr" data-product="default">
      <body>{children}</body>
    </html>
  );
}
