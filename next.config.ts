import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "playwright-core",
    "@sparticuz/chromium",
    "react-dom",
  ],
};

export default nextConfig;
