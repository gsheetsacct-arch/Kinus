import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Roster exports are uploaded through a server action; the default limit is 1 MB.
    serverActions: { bodySizeLimit: "16mb" },
  },
  // Chromium for tag PDFs ships as its own package and must not be bundled.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Read from disk at runtime, so the build can't see they're needed: the fonts embedded
  // into printed tags (small: every route), and, for /api/render only, the compressed Chromium
  // the PDFs and pictures are made with (without it: "The input directory …/@sparticuz/chromium/bin
  // does not exist") with pdf.js, which draws uploaded PDF artwork as pictures.
  // Every deployment stores each function's files: Chromium (67 MB) in every route that prints
  // was gigabytes per deployment. So it's in this one function, and the rest of Kinus asks it
  // (lib/print/chromium). Nothing else may import lib/print/pdf (test/chromium-trace checks).
  outputFileTracingIncludes: {
    "/**/*": ["./lib/print/fonts/**"],
    "/api/render": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/pdfjs-dist/build/pdf.min.js", "./node_modules/pdfjs-dist/build/pdf.worker.min.js"],
  },
};

export default nextConfig;
