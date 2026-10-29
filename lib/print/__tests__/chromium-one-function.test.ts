import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Chromium ships in /api/render only (next.config.ts): code anywhere else that loads
// lib/print/pdf (or puppeteer, or Chromium itself) would make that route need it too.
const ROOT = path.resolve(__dirname, "../../..");
const files = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") || e.name === "__tests__" ? [] : files(rel);
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
  });

describe("Chromium stays in one function", () => {
  it("only /api/render loads lib/print/pdf, puppeteer or Chromium", () => {
    const loaders = [...files("app"), ...files("lib"), ...files("components")].filter((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      // type-only imports are erased; anything else loads the module
      const value = src.split("\n").filter((l) => !/^\s*import type /.test(l) && !/^\s*(\/\/|\*)/.test(l));
      return value.some((l) => /["'](@\/lib\/print\/pdf|\.\/pdf|puppeteer-core|@sparticuz\/chromium)["']/.test(l));
    });
    expect(loaders.sort()).toEqual([path.join("app", "api", "render", "route.ts"), path.join("lib", "print", "pdf.ts")]);
  });
});
