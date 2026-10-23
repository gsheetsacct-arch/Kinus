import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Roster exports are uploaded through a server action; the default limit is 1 MB.
    serverActions: { bodySizeLimit: "16mb" },
  },
  // Chromium for tag PDFs ships as its own package and must not be bundled.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Read from disk at runtime, so the build can't see they're needed: the fonts embedded
  // into printed tags, and the compressed Chromium the tag PDFs are made with (without it:
  // "The input directory …/@sparticuz/chromium/bin does not exist").
  // pdf.js too: it draws uploaded PDF artwork as pictures for the screen (lib/print/pdf-art).
  outputFileTracingIncludes: {
    "/**/*": ["./lib/print/fonts/**", "./node_modules/@sparticuz/chromium/bin/**", "./node_modules/pdfjs-dist/build/pdf.min.js", "./node_modules/pdfjs-dist/build/pdf.worker.min.js"],
  },
};

export default nextConfig;
