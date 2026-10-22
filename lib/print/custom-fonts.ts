import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { CUSTOM_PREFIX, customFamily, type CustomFont } from "./font-families";
import type { TemplateSpec } from "./types";

/**
 * Fonts the designer brings (their own typefaces), for text parts. The files are kept with the
 * template pictures (storage "templates/fonts/…"); the list is a settings row
 * ("custom_fonts"), so no database change. A part uses one as font "custom:<id>"; each font
 * can have a regular and a bold, upright and italic, and the printed page embeds the files it
 * uses, so what the editor shows is what prints.
 */
export type CustomFontFile = { path: string; weight: 400 | 700; italic: boolean; format: "truetype" | "opentype" | "woff" | "woff2" };
export type CustomFontEntry = CustomFont & { files: CustomFontFile[]; by?: string; at?: string };

const KEY = "custom_fonts";
const FORMATS: Record<string, CustomFontFile["format"]> = { ttf: "truetype", otf: "opentype", woff: "woff", woff2: "woff2" };
const MIME: Record<CustomFontFile["format"], string> = { truetype: "font/ttf", opentype: "font/otf", woff: "font/woff", woff2: "font/woff2" };
export const MAX_FONT_BYTES = 6 * 1024 * 1024;

export async function loadCustomFonts(): Promise<CustomFontEntry[]> {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", KEY).maybeSingle();
  return Array.isArray(data?.value) ? (data.value as unknown as CustomFontEntry[]).filter((f) => f && typeof f.id === "string" && Array.isArray(f.files)) : [];
}

async function saveCustomFonts(list: CustomFontEntry[], by: string) {
  const { error } = await createAdminClient()
    .from("settings")
    .upsert({ key: KEY, value: list as never, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw error;
}

const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `font-${randomBytes(3).toString("hex")}`;

/** What a font file is, from its first bytes (never trust the name alone). */
function sniff(bytes: Uint8Array): CustomFontFile["format"] | null {
  const tag = String.fromCharCode(...bytes.slice(0, 4));
  if (tag === "wOF2") return "woff2";
  if (tag === "wOFF") return "woff";
  if (tag === "OTTO") return "opentype";
  if ((bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) || tag === "true") return "truetype";
  return null;
}

/**
 * Adds a font file: a new font by name, or another weight/style of one already there (same
 * name). Returns the font as a part uses it ("custom:<id>").
 */
export async function addCustomFont(input: { name: string; fileName: string; bytes: Uint8Array; weight: 400 | 700; italic: boolean }, by: string): Promise<CustomFontEntry> {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("Give the font a name.");
  if (input.bytes.length > MAX_FONT_BYTES) throw new Error("Font files up to 6 MB, please.");
  const ext = input.fileName.toLowerCase().split(".").pop() ?? "";
  const format = sniff(input.bytes);
  if (!format || !FORMATS[ext]) throw new Error("That isn't a font file Kinus can use (TTF, OTF, WOFF or WOFF2).");
  const list = await loadCustomFonts();
  let font = list.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (!font) {
    let id = slug(name);
    while (list.some((f) => f.id === id)) id = `${id}-${randomBytes(2).toString("hex")}`;
    font = { id, name, files: [], by, at: new Date().toISOString() };
    list.push(font);
  }
  const path = `fonts/${font.id}-${input.weight}${input.italic ? "i" : ""}-${randomBytes(3).toString("hex")}.${ext}`;
  const { error } = await createAdminClient().storage.from("templates").upload(path, input.bytes, { contentType: MIME[format], upsert: true });
  if (error) throw error;
  const old = font.files.find((f) => f.weight === input.weight && f.italic === input.italic);
  font.files = [...font.files.filter((f) => f !== old), { path, weight: input.weight, italic: input.italic, format }];
  await saveCustomFonts(list, by);
  if (old) await createAdminClient().storage.from("templates").remove([old.path]);
  return font;
}

/** Removes a font (templates using it fall back to the default font). */
export async function removeCustomFont(id: string, by: string): Promise<void> {
  const list = await loadCustomFonts();
  const font = list.find((f) => f.id === id);
  if (!font) return;
  await saveCustomFonts(
    list.filter((f) => f.id !== id),
    by,
  );
  await createAdminClient()
    .storage.from("templates")
    .remove(font.files.map((f) => f.path));
}

/** The files a font has, served to the editor (route /print/fonts/[file]). */
export async function fontFile(path: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const list = await loadCustomFonts();
  const file = list.flatMap((f) => f.files).find((f) => f.path === path);
  if (!file) return null;
  const { data } = await createAdminClient().storage.from("templates").download(path);
  if (!data) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), type: MIME[file.format] };
}

const cache = new Map<string, string>();

/** @font-face rules for the custom fonts a template uses, the files inlined (for printing and PDFs). */
export async function customFontCss(spec: Pick<TemplateSpec, "layers">): Promise<string> {
  const used = [...new Set(spec.layers.flatMap((l) => (l.type === "text" && !l.hidden && l.font?.startsWith(CUSTOM_PREFIX) ? [l.font.slice(CUSTOM_PREFIX.length)] : [])))];
  if (!used.length) return "";
  const fonts = (await loadCustomFonts()).filter((f) => used.includes(f.id));
  const rules = await Promise.all(
    fonts.flatMap((font) =>
      font.files.map(async (file) => {
        const hit = cache.get(file.path);
        if (hit !== undefined) return hit;
        const got = await fontFile(file.path);
        const rule = got
          ? `@font-face{font-family:"${customFamily(font.id)}";font-style:${file.italic ? "italic" : "normal"};font-weight:${file.weight};font-display:block;src:url(data:${got.type};base64,${Buffer.from(got.bytes).toString("base64")}) format("${file.format}");}`
          : "";
        if (rule) cache.set(file.path, rule);
        return rule;
      }),
    ),
  );
  return rules.join("");
}

/** @font-face rules pointing at the served files (the editor: light page, files cached). */
export function customFontLinks(fonts: CustomFontEntry[]): string {
  return fonts
    .flatMap((font) =>
      font.files.map(
        (file) =>
          `@font-face{font-family:"${customFamily(font.id)}";font-style:${file.italic ? "italic" : "normal"};font-weight:${file.weight};font-display:block;src:url("/print/fonts/${encodeURIComponent(file.path.slice("fonts/".length))}") format("${file.format}");}`,
      ),
    )
    .join("");
}
