import type { Metadata } from "next";
import "./globals.css";
import "./cockpit.css";
import { UI } from "@/lib/ui-strings";
import PostHogProvider from "@/components/providers/PostHogProvider";

export const metadata: Metadata = {
  title: UI.app.name,
  description: UI.app.description,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // data-product reste figé pour la palette Cockpit BienCible.
  return (
    <html lang="fr" data-product="default">
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
