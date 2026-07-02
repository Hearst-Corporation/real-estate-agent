import type { Metadata } from "next";
import "./globals.css";
import { UI } from "@/lib/ui-strings";
import PostHogProvider from "@/components/providers/PostHogProvider";
import WebVitals from "@/components/WebVitals";

export const metadata: Metadata = {
  title: UI.app.name,
  description: UI.app.description,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <PostHogProvider>
          <WebVitals />
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
