import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Roster exports are uploaded through a server action; the default limit is 1 MB.
    serverActions: { bodySizeLimit: "16mb" },
  },
  // Chromium for tag PDFs ships as its own package and must not be bundled.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Fonts embedded into printed tags are read from disk at runtime.
  outputFileTracingIncludes: { "/**/*": ["./lib/print/fonts/**"] },
};

export default nextConfig;
