import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPictures } from "./chromium";
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

export type Box = { x: number; y: number; w: number; h: number };

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

/**
 * Stores a PDF and a picture of each page (templates/pictures/…). Returns, per page, the
 * picture's path and the `pdf` a picture part keeps, with the page's size.
 */
export async function storePdfArt(bytes: Uint8Array, tag?: { w: number; h: number } | null): Promise<{ path: string; pdf: PdfArt; widthMm: number; heightMm: number; png: Buffer }[]> {
  if (bytes.length > MAX_PDF_BYTES) throw new Error("PDFs up to 15 MB, please.");
  if (Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") throw new Error("That isn't a PDF.");
  const pages = await pdfPages(bytes, tag);
  const base = `pictures/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const store = createAdminClient().storage.from("templates");
  // the PDF first: the pictures are made from it where Chromium is (/api/render), straight into storage
  const { error } = await store.upload(`${base}.pdf`, bytes, { contentType: "application/pdf", upsert: false });
  if (error) throw error;
  const pngs = await renderPictures(
    `${base}.pdf`,
    pages.map((p) => p.box),
    pages.map((_, i) => `${base}-p${i + 1}.png`),
  );
  return pages.map((p, i) => ({
    path: `${base}-p${i + 1}.png`,
    pdf: { path: `${base}.pdf`, page: i + 1, box: [p.box.x, p.box.y, p.box.w, p.box.h] },
    widthMm: p.widthMm,
    heightMm: p.heightMm,
    png: pngs[i],
  }));
}

/** Where the PDFs a template's picture parts were made from are (templates/…), for the PDFs Kinus makes. */
export const pdfArtPaths = (layers: Layer[]): string[] => [...new Set(layers.flatMap((l) => (l.type === "image" && l.pdf && !l.hidden ? [l.pdf.path] : [])))];

/** Those PDFs, by path (where the PDF is made: /api/render). */
export async function loadPdfArt(paths: string[]): Promise<Record<string, Uint8Array>> {
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
