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
  if (!executablePath) {
    const chromium = (await import("@sparticuz/chromium")).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
  }
  const browser = await puppeteer.launch({ executablePath, args, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    await page.waitForSelector("body[data-fitted]", { timeout: 15000 }).catch(() => undefined);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 45000 });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
