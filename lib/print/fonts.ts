import { readFileSync } from "node:fs";
import path from "node:path";

let css: string | null = null;

/** @font-face rules with the fonts inlined, so rendering never depends on the network. */
export function embeddedFontCss(): string {
  if (css !== null) return css;
  const dir = path.join(process.cwd(), "lib/print/fonts");
  const face = (family: string, file: string, weight: number, range: string) => {
    try {
      const b64 = readFileSync(path.join(dir, file)).toString("base64");
      return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${range};}`;
    } catch {
      return "";
    }
  };
  const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
  const LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
  const HEBREW = "U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F";
  css = [400, 700]
    .flatMap((w) => [
      face("Kinus Sans", `noto-sans-latin-${w}-normal.woff2`, w, LATIN),
      face("Kinus Sans", `noto-sans-latin-ext-${w}-normal.woff2`, w, LATIN_EXT),
      face("Kinus Sans", `noto-sans-hebrew-hebrew-${w}-normal.woff2`, w, HEBREW),
    ])
    .join("");
  return css;
}
