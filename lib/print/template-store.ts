import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A template as saved: checked part by part, then written (with the server's key, after the
 * caller checked who may change templates: lib/print/designers). The template editor and the
 * design connector (MCP) save through here, so the same rules apply to both.
 */
const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
// lock (can't be moved on the canvas) and hide (doesn't show or print) work on every kind of part
const partFlags = { locked: z.boolean().optional(), hidden: z.boolean().optional(), side: z.literal("back").optional() };
const layerSchema = z.discriminatedUnion("type", [
  z.object({ ...partFlags, id: z.string(), type: z.literal("text"), text: z.string(), x: num(-50, 500), y: num(-50, 500), w: num(1, 500), h: num(1, 500), size: num(3, 200), weight: z.union([z.literal(400), z.literal(700)]).optional(), align: z.enum(["left", "center", "right"]).optional(), color: z.string().max(40).optional(), fit: z.boolean().optional(), wrap: z.boolean().optional(), valign: z.enum(["top", "middle", "bottom"]).optional(), lineHeight: num(0.8, 3).optional(), curve: z.enum(["top", "bottom"]).optional(), arc: num(20, 350).optional(), letterSpacing: num(-0.2, 1).optional(), wordSpacing: num(-0.5, 3).optional(), rotate: z.union([z.literal(0), z.literal(90), z.literal(-90)]).optional(), minSize: num(3, 200).optional(), font: z.union([z.enum(["sans", "rounded", "serif", "display"]), z.string().regex(/^custom:[a-z0-9-]{1,48}$/, "That font isn't one of the uploaded ones.")]).optional(), italic: z.boolean().optional(), underline: z.boolean().optional() }),
  z.object({ ...partFlags, id: z.string(), type: z.literal("barcode"), text: z.string(), x: num(-50, 500), y: num(-50, 500), w: num(1, 500), h: num(1, 500), showText: z.boolean().optional(), rotate: z.union([z.literal(0), z.literal(90), z.literal(-90)]).optional(), color: z.string().max(40).optional() }),
  z.object({ ...partFlags, id: z.string(), type: z.literal("qr"), text: z.string(), x: num(-50, 500), y: num(-50, 500), w: num(1, 500), h: num(1, 500), color: z.string().max(40).optional(), shape: z.enum(["square", "round"]).optional() }),
  z.object({
    ...partFlags,
    id: z.string(),
    type: z.literal("image"),
    // a picture uploaded for templates (uploadTemplateImage): never a path outside that
    path: z.string().max(200).regex(/^pictures\/[\w.-]+$/, "That picture isn't one of the uploaded ones."),
    // another picture per division (by name); "" = none for that division
    byDivision: z.record(z.string().trim().min(1).max(100), z.union([z.literal(""), z.string().max(200).regex(/^pictures\/[\w.-]+$/, "That picture isn't one of the uploaded ones.")])).optional(),
    x: num(-50, 500),
    y: num(-50, 500),
    w: num(1, 500),
    h: num(1, 500),
    fit: z.enum(["contain", "cover"]).optional(),
    // the uploaded PDF page this picture shows (the PDFs Kinus makes use the PDF itself)
    pdf: z
      .object({
        path: z.string().max(200).regex(/^pictures\/[\w.-]+\.pdf$/, "That PDF isn't one of the uploaded ones."),
        page: z.number().int().min(1).max(50),
        box: z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]),
      })
      .optional(),
  }),
  z.object({ ...partFlags, id: z.string(), type: z.literal("box"), x: num(-50, 500), y: num(-50, 500), w: num(0.1, 500), h: num(0.1, 500), fill: z.string().max(60).optional(), radius: num(0, 100).optional(), border: z.string().max(40).optional() }),
]);
const sheetSchema = z.object({
  paper: z.enum(["letter", "a4"]),
  cols: z.coerce.number().min(1).max(10).transform(Math.round),
  rows: z.coerce.number().min(1).max(30).transform(Math.round),
  leftMm: num(-50, 200).optional(),
  topMm: num(-50, 200).optional(),
  pitchXMm: num(1, 300).optional(),
  pitchYMm: num(1, 300).optional(),
  marginMm: num(0, 50).optional(),
  gapMm: num(0, 50).optional(),
  preset: z.string().max(40).optional(),
  shiftXMm: num(-10, 10).optional(),
  shiftYMm: num(-10, 10).optional(),
});
export const templateSchema = z.object({
  id: z.guid().optional(),
  name: z.string().trim().min(1, "Give the template a name."),
  kind: z.enum(["name_tag", "luggage_tag", "other"]),
  page_width_mm: num(10, 600),
  page_height_mm: num(10, 600),
  layers: z.array(layerSchema).max(120),
  sheet_layout: sheetSchema.nullable(),
  // two-sided (migration 0035): which edge the paper turns on, and a nudge for the back
  back: z.object({ flip: z.enum(["long", "short"]), shiftXMm: num(-20, 20).optional(), shiftYMm: num(-20, 20).optional() }).nullable().optional(),
  // the camps it's for, by name (migration 0036); none: every camp
  camps: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  // who it's for (migration 0041): campers, or staff (Print → Staff tags)
  audience: z.enum(["campers", "staff"]).optional(),
  show_on_card: z.boolean(),
  auto_on_first_checkin: z.boolean(),
  copies: z.coerce.number().int().min(1).max(10).default(1),
});
export type TemplateInput = z.input<typeof templateSchema>;

/** A save problem in words: which part ("Part 3, the barcode") and what's wrong with it. */
export function templateProblem(e: z.ZodError, input: TemplateInput): string {
  const issue = e.issues[0];
  const [first, i, field] = issue.path;
  const what: Record<string, string> = { w: "its width", h: "its height", x: "how far from the left", y: "how far from the top", size: "the text size", minSize: "the smallest text size", radius: "the rounded corners" };
  if (first === "layers" && typeof i === "number") {
    const l = input.layers?.[i] as { type?: string } | undefined;
    const kind = l?.type === "text" ? "the text" : l?.type === "barcode" ? "the barcode" : l?.type === "qr" ? "the QR code" : l?.type === "image" ? "the picture" : "the colour block";
    return `Part ${i + 1} (${kind}): ${typeof field === "string" && what[field] ? `${what[field]} is out of range` : issue.message}.`;
  }
  if (first === "sheet_layout") return `The label sheet settings: ${issue.message}.`;
  if (first === "layers") return "Up to 60 parts on one template.";
  return issue.message;
}


/** Saves a template (new without an id). Throws with a message a person can act on. */
export async function storeTemplate(input: TemplateInput): Promise<{ id: string; created: boolean }> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) throw new Error(templateProblem(parsed.error, input));
  const t = parsed.data;
  const supabase = createAdminClient();
  const row = {
    name: t.name,
    kind: t.kind,
    page_width_mm: t.page_width_mm,
    page_height_mm: t.page_height_mm,
    layers: t.layers,
    sheet_layout: t.sheet_layout,
    // staff tags are never offered on camper cards or at check-in
    show_on_card: t.audience === "staff" ? false : t.show_on_card,
    auto_on_first_checkin: t.audience === "staff" ? false : t.auto_on_first_checkin,
    copies: t.copies,
    back: t.back ?? null,
    camps: t.audience === "staff" ? [] : (t.camps ?? []),
    // only when the save says (a save from the design connector leaves a staff tag a staff tag)
    ...(t.audience ? { audience: t.audience } : {}),
    updated_at: new Date().toISOString(),
  };
  // settings added by later migrations: if one isn't there yet, save the rest, and say so
  // only if it matters (the setting isn't at its usual value)
  const later: Record<"copies" | "back" | "camps" | "audience", { used: boolean; need: string }> = {
    copies: { used: t.copies !== 1, need: "To set how many per camper, run migration 0028 in Supabase first." },
    back: { used: Boolean(t.back), need: "To print on both sides, run migration 0035 in Supabase first." },
    camps: { used: Boolean(t.camps?.length), need: "To keep a template to some camps, run migration 0036 in Supabase first." },
    audience: { used: t.audience === "staff", need: "To make templates for staff, run migration 0041 in Supabase first." },
  };
  const payload: Partial<typeof row> = { ...row };
  const { count } = t.id ? { count: 0 } : await supabase.from("print_templates").select("id", { count: "exact", head: true });
  for (let attempt = 0; ; attempt++) {
    const { data, error } = t.id
      ? await supabase.from("print_templates").update(payload).eq("id", t.id).select("id").single()
      : await supabase.from("print_templates").insert({ ...(payload as typeof row), sort_order: (count ?? 0) + 1 }).select("id").single();
    const missing = error && attempt < 3 ? (Object.keys(later) as (keyof typeof later)[]).find((k) => k in payload && new RegExp(`\\b${k}\\b`).test(error.message)) : undefined;
    if (missing) {
      if (later[missing].used) throw new Error(later[missing].need);
      delete payload[missing];
      continue;
    }
    if (error || !data) throw error ?? new Error("The template wasn't saved.");
    return { id: t.id ?? data.id, created: !t.id };
  }
}
