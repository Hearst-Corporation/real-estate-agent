import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: [
    "playwright-core",
    "@sparticuz/chromium",
    "react-dom",
  ],
};

export default nextConfig;
