import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Roster exports are uploaded through a server action; the default limit is 1 MB.
    serverActions: { bodySizeLimit: "16mb" },
  },
  // Chromium for tag PDFs ships as its own package and must not be bundled.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Read from disk at runtime, so the build can't see they're needed: the fonts embedded
  // into printed tags (small: every route), and the compressed Chromium the tag PDFs are made
  // with (without it: "The input directory …/@sparticuz/chromium/bin does not exist") with
  // pdf.js, which draws uploaded PDF artwork as pictures (lib/print/pdf-art).
  // Chromium is 67 MB: only the routes that make PDFs or pictures of tags get it, or every
  // deployment stores it once per route (5 GB of Functions Storage). These are the routes whose
  // code (or server actions) can reach lib/print/pdf: the print pages, the camper card's print
  // button (check-in, Who's here, Not here yet, Final check-out, the camper page), the office
  // email test, the design connector and the print-part cron. Patterns match the route as
  // "/app/…" anywhere in it; "!(/**)" keeps /print from taking every page under it.
  // A new route that makes PDFs goes on this list.
  outputFileTracingIncludes: {
    "/**/*": ["./lib/print/fonts/**"],
    ...Object.fromEntries(
      [
        "/app/admin/settings",
        "/app/campers/\\[id\\]",
        "/app/checkout",
        "/app/missing",
        "/app/scan",
        "/app/status",
        "/app/api/cron/print-part",
        "/app/api/mcp",
        "/app/print!(/**)",
        "/app/print/{batch,export,fields,together,sheet,sheet/pdf,templates,templates/*,jobs/*,jobs/*/*}",
      ].map((route) => [route, ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/pdfjs-dist/build/pdf.min.js", "./node_modules/pdfjs-dist/build/pdf.worker.min.js"]]),
    ),
  },
};

export default nextConfig;
