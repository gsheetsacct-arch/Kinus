import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/auth/app-url";
import type { FitNotes, PartFit } from "./pdf";
import type { Box } from "./pdf-art";

/**
 * Chromium (67 MB) ships in one function only, /api/render: every deployment stores each
 * function's files, so Chromium in every route that prints was gigabytes per deployment.
 * Everything else asks /api/render through these, with a request signed with the server's own
 * key. The page goes in, and the PDF or pictures come back, through private storage
 * (print-output/render/…): past the 4.5 MB a request or an answer may carry on Vercel.
 */

export type RenderRequest =
  | { kind: "pdf"; html: string; out: string; art: string[] }
  | { kind: "png"; html: string; out: string; tags: number; scale?: number }
  | { kind: "pictures"; pdf: string; boxes: Box[]; out: string[] };
export type RenderAnswer = { ok: true; fit?: FitNotes | PartFit; images?: number } | { ok: false; error: string };

const BUCKET = "print-output";
const DIR = "render/";
// a signed request is good for a few minutes (it names files that are removed after)
const MAX_AGE_MS = 5 * 60_000;
// the render function may run a minute; leave the caller time to answer after it
const WAIT_MS = 58_000;

const sign = (body: string) => createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update(`render|${body}`).digest("hex");

/** Whether a request to /api/render was signed by Kinus (and recently). */
export function validRender(body: string, signature: string | null): boolean {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !signature) return false;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(signature);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  const at = Number((JSON.parse(body) as { at?: number }).at);
  return Number.isFinite(at) && Math.abs(Date.now() - at) < MAX_AGE_MS;
}

/** Only files under print-output/render/ (and pictures/… in templates, for PDF artwork) may be named. */
export const renderPath = (p: unknown): p is string => typeof p === "string" && p.startsWith(DIR) && /^[\w./-]+$/.test(p) && !p.includes("..");
export const picturePath = (p: unknown): p is string => typeof p === "string" && /^pictures\/[\w.-]+\.(pdf|png)$/.test(p);

async function call(req: RenderRequest, base?: string): Promise<RenderAnswer & { ok: true }> {
  const body = JSON.stringify({ ...req, at: Date.now() });
  const url = `${(base ?? (await appUrl())).replace(/\/+$/, "")}/api/render`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Kinus-Sign": sign(body) },
    body,
    signal: AbortSignal.timeout(WAIT_MS),
  }).catch((e: unknown) => {
    throw new Error(e instanceof Error && e.name === "TimeoutError" ? "making it took too long" : `Kinus' printer couldn't be reached (${e instanceof Error ? e.message : String(e)})`);
  });
  const answer = (await res.json().catch(() => null)) as RenderAnswer | null;
  if (!answer) throw new Error(`Kinus' printer answered ${res.status}`);
  if (!answer.ok) throw new Error(answer.error);
  return answer;
}

/** A page into storage for /api/render, and back out of it afterwards. */
function scratch() {
  const store = createAdminClient().storage.from(BUCKET);
  const id = `${DIR}${randomUUID()}`;
  const made: string[] = [];
  return {
    id,
    async put(html: string) {
      const path = `${id}.html`;
      made.push(path);
      const { error } = await store.upload(path, Buffer.from(html, "utf8"), { contentType: "text/html; charset=utf-8", upsert: true });
      if (error) throw error;
      return path;
    },
    async take(path: string) {
      made.push(path);
      const { data, error } = await store.download(path);
      if (!data) throw error ?? new Error("the printer's file went missing");
      return Buffer.from(await data.arrayBuffer());
    },
    // never fails the print: a file left over is only a little storage
    clean: () => store.remove(made).then(
      () => undefined,
      () => undefined,
    ),
  };
}

/**
 * The page as a PDF, and the names that had to go small to fit (or didn't). `art`: the PDFs
 * of picture parts made from PDF artwork (templates/…), drawn as themselves (sharp).
 */
export async function renderPdf(html: string, opts: { art?: string[]; base?: string } = {}): Promise<{ pdf: Buffer; fit: FitNotes }> {
  const s = scratch();
  try {
    const out = `${s.id}.pdf`;
    const a = await call({ kind: "pdf", html: await s.put(html), out, art: opts.art ?? [] }, opts.base);
    return { pdf: await s.take(out), fit: (a.fit as FitNotes | undefined) ?? { smaller: [], cut: [] } };
  } finally {
    await s.clean();
  }
}

/** Pictures of the first `tags` tags of a page (0: none, just the fit), and how each text part fitted. */
export async function renderPng(html: string, opts: { tags?: number; scale?: number; base?: string } = {}): Promise<{ images: Buffer[]; fit: PartFit }> {
  const s = scratch();
  try {
    const out = `${s.id}.png`;
    const a = await call({ kind: "png", html: await s.put(html), out, tags: opts.tags ?? 2, scale: opts.scale }, opts.base);
    const images = await Promise.all(Array.from({ length: a.images ?? 0 }, (_, i) => s.take(`${out}.${i}`)));
    return { images, fit: (a.fit as PartFit | undefined) ?? {} };
  } finally {
    await s.clean();
  }
}

/**
 * Pictures of the pages of a PDF already in storage (templates/pictures/….pdf), each cropped to
 * its box, saved at `out` (templates/pictures/….png). Returns them too.
 */
export async function renderPictures(pdf: string, boxes: Box[], out: string[], base?: string): Promise<Buffer[]> {
  await call({ kind: "pictures", pdf, boxes, out }, base);
  const store = createAdminClient().storage.from("templates");
  return Promise.all(
    out.map(async (p) => {
      const { data, error } = await store.download(p);
      if (!data) throw error ?? new Error("a picture of the PDF went missing");
      return Buffer.from(await data.arrayBuffer());
    }),
  );
}
