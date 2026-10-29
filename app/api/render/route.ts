import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { picturePath, renderPath, validRender, type RenderAnswer, type RenderRequest } from "@/lib/print/chromium";

// the only function with Chromium in it (next.config.ts): PDFs and pictures for the rest of Kinus
export const maxDuration = 60;

const answer = (a: RenderAnswer, status = 200) => NextResponse.json(a, { status });

/**
 * Makes a PDF or pictures with Chromium, for Kinus itself (lib/print/chromium): the request is
 * signed with the server's own key, and names the page in storage to read and where to put
 * what it makes.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!validRender(body, request.headers.get("x-kinus-sign"))) return answer({ ok: false, error: "Not allowed." }, 403);
  const req = JSON.parse(body) as RenderRequest;
  const admin = createAdminClient();
  const out = admin.storage.from("print-output");
  const page = async (path: unknown) => {
    if (!renderPath(path)) throw new Error("bad page");
    const { data, error } = await out.download(path);
    if (!data) throw error ?? new Error("the page to print went missing");
    return data.text();
  };
  const put = async (path: unknown, bytes: Buffer, contentType: string) => {
    if (!renderPath(path)) throw new Error("bad output");
    const { error } = await out.upload(path, bytes, { contentType, upsert: true });
    if (error) throw error;
  };
  try {
    const pdf = await import("@/lib/print/pdf");
    if (req.kind === "pdf") {
      const { loadPdfArt } = await import("@/lib/print/pdf-art");
      let fit: Parameters<NonNullable<Parameters<typeof pdf.htmlToPdf>[1]>>[0] | undefined;
      const [html, art] = await Promise.all([page(req.html), loadPdfArt((req.art ?? []).filter(picturePath))]);
      const made = await pdf.htmlToPdf(html, (n) => (fit = n), art);
      await put(req.out, made, "application/pdf");
      return answer({ ok: true, fit });
    }
    if (req.kind === "png") {
      const { images, fit } = await pdf.htmlToPng(await page(req.html), { tags: req.tags, scale: req.scale });
      await Promise.all(images.map((png, i) => put(`${req.out}.${i}`, png, "image/png")));
      return answer({ ok: true, fit, images: images.length });
    }
    if (req.kind === "pictures") {
      if (!picturePath(req.pdf) || !req.out.every(picturePath) || req.out.length !== req.boxes.length) throw new Error("bad pictures");
      const store = admin.storage.from("templates");
      const { data, error } = await store.download(req.pdf);
      if (!data) throw error ?? new Error("the PDF went missing");
      const pngs = await pdf.pdfPictures(new Uint8Array(await data.arrayBuffer()), req.boxes);
      const saved = await Promise.all(pngs.map((png, i) => store.upload(req.out[i], png, { contentType: "image/png", upsert: false })));
      for (const s of saved) if (s.error) throw s.error;
      return answer({ ok: true, images: pngs.length });
    }
    return answer({ ok: false, error: "Unknown request." }, 400);
  } catch (e) {
    return answer({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
