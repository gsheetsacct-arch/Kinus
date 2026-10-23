import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { launchBrowser } from "./pdf";
import type { Layer, PdfArt } from "./types";

/**
 * PDF artwork for templates (a designer's InDesign export): kept as the PDF it is. A picture
 * part made from it has a picture of the page for the screen (editor, previews, printing from
 * the browser) and remembers the PDF page (`pdf`), which the PDFs Kinus makes draw instead,
 * underneath the tag's other parts: lines and letters stay sharp at any size (lib/print/pdf).
 *
 * The part of the page used is the box that matches the tag's shape best: the trim box (the
 * finished size), the bleed box (with the extra edge printed past it), or the whole page, so
 * a print-ready PDF with crop marks lines up with the tag.
 */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 6;

type Box = { x: number; y: number; w: number; h: number };

/** The pages of a PDF: their boxes (pt) and the one to use, for a tag `tag` mm (or none). */
export async function pdfPages(bytes: Uint8Array, tag?: { w: number; h: number } | null): Promise<{ box: Box; widthMm: number; heightMm: number }[]> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages().slice(0, MAX_PAGES);
  if (!pages.length) throw new Error("That PDF has no pages.");
  return pages.map((p) => {
    const asBox = (b: { x: number; y: number; width: number; height: number }): Box => ({ x: b.x, y: b.y, w: b.width, h: b.height });
    const media = asBox(p.getMediaBox());
    const bleed = asBox(p.getBleedBox());
    const trim = asBox(p.getTrimBox());
    let box = trim;
    if (tag) {
      // the closest in shape; on a near tie the bleed (its edge prints past the cut)
      const want = tag.w / tag.h;
      const off = (b: Box) => Math.abs(b.w / b.h - want) / want;
      box = [bleed, trim, media].reduce((best, b) => (off(b) < off(best) - 0.005 ? b : best), bleed);
    }
    const mm = (pt: number) => Math.round((pt / 72) * 25.4 * 100) / 100;
    return { box, widthMm: mm(box.w), heightMm: mm(box.h) };
  });
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
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
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

/**
 * Stores a PDF and a picture of each page (templates/pictures/…). Returns, per page, the
 * picture's path and the `pdf` a picture part keeps, with the page's size.
 */
export async function storePdfArt(bytes: Uint8Array, tag?: { w: number; h: number } | null): Promise<{ path: string; pdf: PdfArt; widthMm: number; heightMm: number; png: Buffer }[]> {
  if (bytes.length > MAX_PDF_BYTES) throw new Error("PDFs up to 15 MB, please.");
  if (Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") throw new Error("That isn't a PDF.");
  const pages = await pdfPages(bytes, tag);
  const pngs = await pdfPictures(bytes, pages.map((p) => p.box));
  const base = `pictures/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const store = createAdminClient().storage.from("templates");
  const saved = await Promise.all([
    store.upload(`${base}.pdf`, bytes, { contentType: "application/pdf", upsert: false }),
    ...pngs.map((png, i) => store.upload(`${base}-p${i + 1}.png`, png, { contentType: "image/png", upsert: false })),
  ]);
  for (const { error } of saved) if (error) throw error;
  return pages.map((p, i) => ({
    path: `${base}-p${i + 1}.png`,
    pdf: { path: `${base}.pdf`, page: i + 1, box: [p.box.x, p.box.y, p.box.w, p.box.h] },
    widthMm: p.widthMm,
    heightMm: p.heightMm,
    png: pngs[i],
  }));
}

/** The PDFs a template's picture parts were made from, by path: for the PDFs Kinus makes. */
export async function loadPdfArt(layers: Layer[]): Promise<Record<string, Uint8Array>> {
  const paths = [...new Set(layers.flatMap((l) => (l.type === "image" && l.pdf && !l.hidden ? [l.pdf.path] : [])))];
  if (!paths.length) return {};
  const store = createAdminClient().storage.from("templates");
  const files = await Promise.all(paths.map((p) => store.download(p).then(async ({ data }) => (data ? new Uint8Array(await data.arrayBuffer()) : null))));
  return Object.fromEntries(paths.flatMap((p, i) => (files[i] ? [[p, files[i]!]] : [])));
}

/**
 * A one-time link to put a PDF straight into storage (uploads/…): past the 4.5 MB a request
 * to Kinus may carry on Vercel. The PDF is then made into artwork with takeUploadedPdf.
 */
export async function pdfUploadLink(): Promise<{ path: string; token: string; url: string }> {
  const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`;
  const { data, error } = await createAdminClient().storage.from("templates").createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Couldn't make an upload link.");
  return { path, token: data.token, url: data.signedUrl };
}

/** The PDF put in storage with a pdfUploadLink link (removed from there once read). */
export async function takeUploadedPdf(path: string): Promise<Uint8Array> {
  if (!/^uploads\/[\w.-]+\.pdf$/.test(path)) throw new Error("That isn't an upload from Kinus' upload link.");
  const store = createAdminClient().storage.from("templates");
  const { data } = await store.download(path);
  if (!data) throw new Error("Nothing was uploaded to that link yet (or it was used already).");
  const bytes = new Uint8Array(await data.arrayBuffer());
  await store.remove([path]);
  return bytes;
}
