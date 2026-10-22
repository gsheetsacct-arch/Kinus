import "server-only";

/**
 * HTML → PDF with headless Chromium. Locally/CI set CHROMIUM_PATH; on Vercel the
 * @sparticuz/chromium build is used. Throws if no browser is available; callers fall
 * back to the printable HTML page.
 */
export type FitNotes = { smaller: { text: string; pt: number }[]; cut: string[] };

export async function htmlToPdf(html: string, onFit?: (notes: FitNotes) => void): Promise<Buffer> {
  const puppeteer = (await import("puppeteer-core")).default;
  let executablePath = process.env.CHROMIUM_PATH;
  let args = ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"];
  // Vercel's build is chrome-headless-shell, which runs as "shell"; a full Chromium (local) runs new headless
  let headless: boolean | "shell" = true;
  if (!executablePath) {
    const chromium = (await import("@sparticuz/chromium")).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
    headless = "shell";
  }
  // all of it stays well inside the 60 s a page may run, so a slow PDF fails cleanly
  // (the request still reaches the office, without the PDF) instead of being cut off
  const browser = await puppeteer.launch({ executablePath, args, headless, timeout: 15000 });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    // long names are shrunk to fit by the page's script: never send a PDF where that didn't finish
    await page.waitForSelector("body[data-fitted]", { timeout: 8000 }).catch(() => {
      throw new Error("the names couldn't be sized to fit in time");
    });
    // names that had to go under their part's smallest size to fit (or didn't fit at all), for the office
    if (onFit)
      onFit(
        await page.evaluate(() => ({
          smaller: [...document.querySelectorAll("[data-small]:not([data-cut])")].map((el) => ({ text: (el.textContent ?? "").trim(), pt: Number(el.getAttribute("data-small")) })),
          cut: [...document.querySelectorAll("[data-cut]")].map((el) => (el.textContent ?? "").trim()),
        })),
      );
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 15000 });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** What happened to each text part when fitting (by part id): its smallest size, and names that shrank or were cut. */
export type PartFit = Record<string, { smallestPt: number | null; shrunk: { text: string; pt: number }[]; cut: string[] }>;

async function launchBrowser() {
  const puppeteer = (await import("puppeteer-core")).default;
  let executablePath = process.env.CHROMIUM_PATH;
  let args = ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"];
  let headless: boolean | "shell" = true;
  if (!executablePath) {
    const chromium = (await import("@sparticuz/chromium")).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
    headless = "shell";
  }
  return puppeteer.launch({ executablePath, args, headless, timeout: 15000 });
}

/**
 * Pictures of the first tags of a page (front and back), exactly as they print, and how each
 * text part fitted: for the design connector, so Claude sees its design.
 */
export async function htmlToPng(html: string, opts: { tags?: number; scale?: number } = {}): Promise<{ images: Buffer[]; fit: PartFit }> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: opts.scale ?? 3 });
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    await page.waitForSelector("body[data-fitted]", { timeout: 8000 }).catch(() => {
      throw new Error("the text couldn't be sized to fit in time");
    });
    // the screen view has a grey page and shadows around tags: plain white for the picture
    await page.addStyleTag({ content: "body{background:#fff!important;padding:0!important;gap:4mm!important}.tag,.sheet{box-shadow:none!important}.sheet.back::before,body>.tag.back::after{display:none!important}" });
    const tags = await page.$$(".tag:not(.used)");
    const images: Buffer[] = [];
    for (const t of tags.slice(0, opts.tags ?? 2)) images.push(Buffer.from(await t.screenshot({ type: "png" })));
    const fit = (await page.evaluate(() => {
      const out: Record<string, { smallestPt: number | null; shrunk: { text: string; pt: number }[]; cut: string[] }> = {};
      document.querySelectorAll<HTMLElement>("[data-part][data-fit]").forEach((el) => {
        const id = el.getAttribute("data-part")!;
        const r = (out[id] ??= { smallestPt: null, shrunk: [], cut: [] });
        const pt = Math.round(parseFloat(getComputedStyle(el).fontSize) * 0.75 * 10) / 10;
        r.smallestPt = r.smallestPt === null ? pt : Math.min(r.smallestPt, pt);
        const text = (el.textContent ?? "").trim();
        if (el.hasAttribute("data-cut")) r.cut.push(text);
        else if (el.hasAttribute("data-small")) r.shrunk.push({ text, pt: Number(el.getAttribute("data-small")) });
      });
      return out;
    })) as PartFit;
    return { images, fit };
  } finally {
    await browser.close();
  }
}
