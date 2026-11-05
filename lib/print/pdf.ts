import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Box } from "./pdf-art";

/**
 * Everything Kinus does with headless Chromium: HTML → PDF, pictures of tags, pictures of
 * PDF artwork. Only /api/render imports this (Chromium is big, so it ships in that one
 * function); everything else asks it through lib/print/chromium. Locally/CI set
 * CHROMIUM_PATH; on Vercel the @sparticuz/chromium build is used. Throws if no browser is
 * available; callers fall back to the printable HTML page.
 */
export type FitNotes = { smaller: { text: string; pt: number }[]; cut: string[] };

export async function htmlToPdf(html: string, onFit?: (notes: FitNotes) => void, art?: Record<string, Uint8Array>): Promise<Buffer> {
  // all of it stays well inside the 60 s a page may run, so a slow PDF fails cleanly
  // (the request still reaches the office, without the PDF) instead of being cut off
  const { browser, page } = await openPage();
  try {
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
    // a label printer's label (6″ × 4″ on 4″ × 6″, 50 × 80 on 80 × 50): laid out as designed, each PDF page then turned a
    // quarter (the server's Chromium shrinks a page whose tag is turned with CSS to about 3/4)
    const turn = await page.$eval("body", (b) => b.getAttribute("data-turn")).catch(() => null);
    if (turn) {
      const [w, h] = turn.split("x").map(Number);
      await page.addStyleTag({ content: `@page{size:${w}mm ${h}mm;margin:0}.pg{width:${w}mm!important;height:${h}mm!important}.pg>.tag{transform:none!important}` });
    }
    // picture parts made from an uploaded PDF: that PDF goes underneath, as it is (sharp)
    if (art && Object.keys(art).length && (await page.$("[data-pdf]"))) {
      const vector = await withPdfArt(page, art);
      if (vector) return turn ? await turnPages(vector) : vector;
    }
    const pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 15000 }));
    return turn ? await turnPages(pdf) : pdf;
  } finally {
    await browser.close();
  }
}

/** What happened to each text part when fitting (by part id): its smallest size, and names that shrank or were cut. */
export type PartFit = Record<string, { smallestPt: number | null; shrunk: { text: string; pt: number }[]; cut: string[] }>;

type Browser = Awaited<ReturnType<typeof import("puppeteer-core")["default"]["launch"]>>;
type Page = Awaited<ReturnType<Browser["newPage"]>>;

/**
 * One Chromium for this server instance, started once and reused (starting it takes seconds; a
 * tab each request is quick). Several requests at once share it. If it went away (crashed, or the
 * instance slept and it lost its connection), the next request starts a new one.
 */
let shared: Promise<Browser> | null = null;

async function startBrowser(): Promise<Browser> {
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
  // just unpacked, the program can still be busy being written ("spawn ETXTBSY"): wait a moment, try again
  for (let attempt = 1; ; attempt++) {
    try {
      return await puppeteer.launch({ executablePath, args, headless, timeout: 15000 });
    } catch (e) {
      if (attempt >= 5 || !/ETXTBSY/.test(String((e as Error)?.message ?? e))) throw e;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
}

async function getBrowser(): Promise<Browser> {
  if (shared) {
    const b = await shared.catch(() => null);
    if (b?.connected) return b;
    shared = null;
  }
  const starting = startBrowser();
  shared = starting;
  starting.catch(() => {
    if (shared === starting) shared = null;
  });
  return starting;
}

/** A new tab in the shared browser (a new browser if that one is gone); close it with closePage. */
export async function openPage(): Promise<{ browser: { close: () => Promise<void> }; page: Page }> {
  let page: Page;
  try {
    page = await (await getBrowser()).newPage();
  } catch {
    // the shared one broke: once more with a fresh browser
    shared = null;
    page = await (await getBrowser()).newPage();
  }
  // "closing the browser" closes this tab only; the browser stays for the next request
  return { browser: { close: () => page.close().catch(() => undefined) }, page };
}

/**
 * Pictures of the first tags of a page (front and back), exactly as they print, and how each
 * text part fitted: for the design connector, so Claude sees its design.
 */
export async function htmlToPng(html: string, opts: { tags?: number; scale?: number } = {}): Promise<{ images: Buffer[]; fit: PartFit }> {
  const { browser, page } = await openPage();
  try {
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

type ArtSpot = { page: number; x: number; y: number; w: number; h: number; pdf: string; n: number; box: number[]; fit: string };

/**
 * The PDF with uploaded PDF artwork as itself: where each such picture sits on each page is
 * measured, the page is made without those pictures (and with no white behind the tags), and
 * each page is rebuilt as the artwork's PDF page in its place with the rest of the tag on top.
 * Null when the pages can't be matched up (the caller then makes it with the pictures).
 */
async function withPdfArt(page: import("puppeteer-core").Page, art: Record<string, Uint8Array>): Promise<Buffer | null> {
  await page.emulateMediaType("print");
  const spots = (await page.evaluate(() => {
    const pages = [...document.querySelectorAll<HTMLElement>("body > .sheet, body > .tag")];
    return {
      pages: pages.length,
      spots: pages.flatMap((pg, i) => {
        const o = pg.getBoundingClientRect();
        return [...pg.querySelectorAll<HTMLElement>("[data-pdf]")].map((el) => {
          const r = el.getBoundingClientRect();
          return { page: i, x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, pdf: el.dataset.pdf!, n: Number(el.dataset.pdfPage) || 1, box: (el.dataset.pdfBox ?? "").split(",").map(Number), fit: el.dataset.pdfFit ?? "contain" };
        });
      }),
    };
  })) as { pages: number; spots: ArtSpot[] };
  await page.addStyleTag({ content: "[data-pdf]{visibility:hidden!important}html,body,.tag,.sheet{background:transparent!important}" });
  const top = await page.pdf({ preferCSSPageSize: true, printBackground: true, omitBackground: true, timeout: 15000 });
  const { PDFDocument } = await import("pdf-lib");
  const front = await PDFDocument.load(top);
  if (front.getPageCount() !== spots.pages) return null;
  const out = await PDFDocument.create();
  const sources = new Map<string, Awaited<ReturnType<typeof PDFDocument.load>>>();
  const placed = new Map<string, Awaited<ReturnType<typeof out.embedPage>>>();
  const PT = 0.75; // CSS px → pt
  const layers = await out.embedPages(front.getPages());
  for (let i = 0; i < front.getPageCount(); i++) {
    const { width, height } = front.getPage(i).getSize();
    const sheet = out.addPage([width, height]);
    for (const s of spots.spots.filter((x) => x.page === i)) {
      const bytes = art[s.pdf];
      if (!bytes || s.box.length !== 4 || s.box.some((v) => !Number.isFinite(v))) continue;
      let src = sources.get(s.pdf);
      if (!src) sources.set(s.pdf, (src = await PDFDocument.load(bytes, { ignoreEncryption: true })));
      if (s.n > src.getPageCount()) continue;
      const [bx, by, bw, bh] = s.box;
      const [w, h] = [s.w * PT, s.h * PT];
      // contain: the whole box, centred; cover: the box cropped to the part's shape
      const scale = s.fit === "cover" ? Math.max(w / bw, h / bh) : Math.min(w / bw, h / bh);
      const [cw, ch] = s.fit === "cover" ? [w / scale, h / scale] : [bw, bh];
      const crop = { left: bx + (bw - cw) / 2, bottom: by + (bh - ch) / 2, right: bx + (bw + cw) / 2, top: by + (bh + ch) / 2 };
      const key = `${s.pdf}|${s.n}|${crop.left.toFixed(2)},${crop.bottom.toFixed(2)},${crop.right.toFixed(2)},${crop.top.toFixed(2)}`;
      let emb = placed.get(key);
      if (!emb) placed.set(key, (emb = await out.embedPage(src.getPage(s.n - 1), crop)));
      const [dw, dh] = [cw * scale, ch * scale];
      const x = s.x * PT + (w - dw) / 2;
      const yTop = s.y * PT + (h - dh) / 2;
      sheet.drawPage(emb, { x, y: height - yTop - dh, width: dw, height: dh });
    }
    sheet.drawPage(layers[i], { x: 0, y: 0, width, height });
  }
  return Buffer.from(await out.save());
}

let pdfjs: { lib: string; worker: string } | null = null;
const pdfjsSource = () =>
  (pdfjs ??= {
    lib: fs.readFileSync(path.join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.min.js"), "utf8"),
    worker: fs.readFileSync(path.join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.min.js"), "utf8"),
  });

/** Pictures (PNG) of PDF pages, each cropped to its box, about 300 dpi (at most 3000 px long). */
export async function pdfPictures(bytes: Uint8Array, boxes: Box[]): Promise<Buffer[]> {
  const src = pdfjsSource();
  const { browser, page } = await openPage();
  try {
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: src.lib });
    const pngs = (await page.evaluate(
      async (data: string, worker: string, boxes: Box[]) => {
        const lib = (window as unknown as { pdfjsLib: { GlobalWorkerOptions: { workerSrc: string }; getDocument: (o: object) => { promise: Promise<{ getPage: (n: number) => Promise<{ view: number[]; getViewport: (o: { scale: number }) => object; render: (o: object) => { promise: Promise<void> } }> }> } } }).pdfjsLib;
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([worker], { type: "text/javascript" }));
        const bin = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        // no script from the PDF runs (isEvalSupported off)
        const doc = await lib.getDocument({ data: bin, isEvalSupported: false, disableFontFace: false }).promise;
        const out: string[] = [];
        for (let i = 0; i < boxes.length; i++) {
          const p = await doc.getPage(i + 1);
          const b = boxes[i];
          const scale = Math.min(300 / 72, 3000 / Math.max(b.w, b.h));
          const viewport = p.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(b.w * scale);
          canvas.height = Math.round(b.h * scale);
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          // the box's top-left corner to the canvas's (PDF y runs up, from the page's own box)
          const [x0, , , y1] = p.view;
          await p.render({ canvasContext: ctx, viewport, transform: [1, 0, 0, 1, -(b.x - x0) * scale, -(y1 - (b.y + b.h)) * scale] }).promise;
          out.push(canvas.toDataURL("image/png").split(",")[1]);
        }
        return out;
      },
      Buffer.from(bytes).toString("base64"),
      src.worker,
      boxes,
    )) as string[];
    return pngs.map((b) => Buffer.from(b, "base64"));
  } finally {
    await browser.close();
  }
}

/** Every page turned a quarter clockwise (shown and printed 4″ × 6″, the design's top to the right). */
async function turnPages(pdf: Buffer): Promise<Buffer> {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.load(pdf);
  for (const p of doc.getPages()) p.setRotation(degrees((p.getRotation().angle + 90) % 360));
  return Buffer.from(await doc.save());
}
