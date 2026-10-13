import "server-only";

/**
 * HTML → PDF with headless Chromium. Locally/CI set CHROMIUM_PATH; on Vercel the
 * @sparticuz/chromium build is used. Throws if no browser is available; callers fall
 * back to the printable HTML page.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
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
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 15000 });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
