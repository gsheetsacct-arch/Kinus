import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { visibleDivisionIds, type CurrentUser } from "@/lib/auth/permissions";
import { FONTS } from "./font-families";
import { addCustomFont, loadCustomFonts } from "./custom-fonts";
import { findPresets, presetById } from "./presets";
import { loadMergeSetup, toSpec } from "./data";
import { copyTemplate, storeTemplate, templateSchema } from "./template-store";
import { allCamperValues, camperValues, longestPerField, previewDocument, sampleValues, worstCaseValues } from "./preview-data";
import type { PartFit } from "./pdf";
import { renderPng } from "./chromium";
import { renderDocument } from "./render";
import { thermalLayers, thermalValues } from "./thermal";
import type { Layer, TemplateSpec } from "./types";
import { DESIGN_GUIDE } from "./design-guide";
import { audienceOf, STAFF_FIELDS, type Audience } from "./staff-values";
import { sampleStaffValues, staffInView, staffLongest, staffPreview } from "./staff";

/**
 * The design connector: Claude reads, designs and previews Kinus templates directly (MCP,
 * app/api/mcp/[token]). It acts as the person whose link it is, who may edit templates
 * (lib/print/designers), and saves through the same checks as the template editor.
 */



const json = (v: unknown) => JSON.stringify(v, null, 2);
const thermalItems = (values: Record<string, string>) => thermalValues([{ values, copies: 1 }])[0].values;
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const problem = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });

/** A draft or saved template, checked as the editor checks it (with who it's for: campers or staff). */
async function resolveSpec(input: { template_id?: string; template?: Record<string, unknown> }): Promise<TemplateSpec & { audience: Audience }> {
  if (input.template) {
    const parsed = templateSchema.safeParse(input.template);
    if (!parsed.success) throw new Error(`The template isn't valid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 5).join("; ")}`);
    const t = parsed.data;
    return { id: t.id, name: t.name, kind: t.kind, page_width_mm: t.page_width_mm, page_height_mm: t.page_height_mm, layers: t.layers as Layer[], sheet_layout: t.sheet_layout, back: t.back ?? null, thermal: Boolean(t.thermal), audience: t.audience ?? "campers" };
  }
  if (!input.template_id) throw new Error("Give template_id, or a draft template.");
  const { data } = await createAdminClient().from("print_templates").select("*").eq("id", input.template_id).maybeSingle();
  if (!data) throw new Error("No template with that id.");
  return { ...toSpec(data), audience: audienceOf(data) };
}

function fitReport(fit: PartFit, spec: TemplateSpec, campers?: number): string {
  const lines: string[] = [];
  for (const l of spec.layers) {
    if (l.type !== "text" || l.hidden) continue;
    const f = fit[l.id];
    if (!f) continue;
    const min = l.minSize ?? Math.min(6, l.size);
    const what = `"${l.text.slice(0, 40)}" (part ${l.id}, ${l.size} pt, smallest normally ${min} pt)`;
    if (f.cut.length) lines.push(`✗ ${what}: too long even at 4 pt for ${f.cut.length}: ${f.cut.slice(0, 5).join(", ")}`);
    if (f.shrunk.length) lines.push(`! ${what}: under ${min} pt for ${f.shrunk.length}${campers ? ` of ${campers}` : ""}: ${f.shrunk.slice(0, 5).map((s) => `${s.text} (${s.pt} pt)`).join(", ")}`);
    if (!f.cut.length && !f.shrunk.length) lines.push(`✓ ${what}: fits${f.smallestPt !== null && f.smallestPt < l.size ? `, down to ${f.smallestPt} pt at the smallest` : ` at ${l.size} pt`}`);
  }
  return lines.join("\n") || "No text parts.";
}

export function designServer(user: CurrentUser, appUrl: string): McpServer {
  const server = new McpServer({ name: "kinus-design", version: "1.0.0" }, { instructions: DESIGN_GUIDE });
  const scope = visibleDivisionIds(user);
  const editorLink = (id: string) => `${appUrl}/print/templates/${id}`;

  server.registerTool("design_guide", { title: "How Kinus templates work", description: "The template format, the parts, fonts and how to design around long names. Read this first.", annotations: { readOnlyHint: true } }, async () => text(DESIGN_GUIDE));

  server.registerTool(
    "list_templates",
    { title: "List templates", description: "Every template: id, name, who it's for (campers or staff), size, label stock, thermal printer, camps.", annotations: { readOnlyHint: true } },
    async () => {
      const { data } = await createAdminClient().from("print_templates").select("*").order("sort_order").order("name");
      return text(
        json(
          (data ?? []).map((t) => {
            const sheet = t.sheet_layout as { preset?: string; cols?: number; rows?: number } | null;
            return {
              id: t.id,
              name: t.name,
              retired: t.name.startsWith("(retired)"),
              for: audienceOf(t),
              kind: t.kind,
              size_mm: `${Number(t.page_width_mm)} × ${Number(t.page_height_mm)}`,
              label_stock: sheet ? (presetById(sheet.preset)?.name ?? `${sheet.cols} × ${sheet.rows} sheet`) : "one per label (label printer)",
              parts: (t.layers as unknown[]).length,
              two_sided: Boolean((t as { back?: unknown }).back),
              thermal: Boolean((t as { thermal?: boolean }).thermal),
              camps: (t as { camps?: string[] }).camps ?? [],
              editor: editorLink(t.id),
            };
          }),
        ),
      );
    },
  );

  server.registerTool(
    "get_template",
    { title: "Get a template", description: "The whole template as JSON (edit it and give it to save_template or preview_template).", inputSchema: { template_id: z.guid() }, annotations: { readOnlyHint: true } },
    async ({ template_id }) => {
      const { data: t } = await createAdminClient().from("print_templates").select("*").eq("id", template_id).maybeSingle();
      if (!t) return problem("No template with that id.");
      return text(
        json({
          id: t.id,
          name: t.name,
          audience: audienceOf(t),
          kind: t.kind,
          page_width_mm: Number(t.page_width_mm),
          page_height_mm: Number(t.page_height_mm),
          sheet_layout: t.sheet_layout,
          back: (t as { back?: unknown }).back ?? null,
          thermal: Boolean((t as { thermal?: boolean }).thermal),
          camps: (t as { camps?: string[] }).camps ?? [],
          show_on_card: t.show_on_card,
          auto_on_first_checkin: t.auto_on_first_checkin,
          copies: Number((t as { copies?: number }).copies) || 1,
          layers: t.layers,
          has_background_picture: Boolean(t.background_path),
        }),
      );
    },
  );

  server.registerTool(
    "list_fields",
    {
      title: "List fields",
      description: "What can go on a tag: each field's {{KEY}}, its name, and what it says for a sample. for: \"staff\" lists what a staff tag can say instead.",
      inputSchema: { for: z.enum(["campers", "staff"]).optional().describe("Whose tag: campers (default) or staff") },
      annotations: { readOnlyHint: true },
    },
    async ({ for: audience }) => {
      if (audience === "staff") {
        const sample = sampleStaffValues();
        return text(
          json({
            fields: STAFF_FIELDS.map((f) => ({ key: `{{${f.key}}}`, name: f.label, sample: sample[f.key] ?? "" })),
            also: "Staff tags are filled from the staff list. The camper names are reused where they mean the same thing, so a camper design copied for staff (copy_template) mostly just works.",
          }),
        );
      }
      const [setup, sample] = await Promise.all([loadMergeSetup(createAdminClient()), sampleValues()]);
      return text(
        json({
          fields: setup.fields.filter((f) => f.enabled !== false).map((f) => ({ key: `{{${f.key}}}`, name: f.label, sample: sample[f.key] ?? "" })),
          also: "{{DIVISION_COLOR}} (the division's colour, for box fills). Fields are made in Kinus (Print → Fields & conversions).",
        }),
      );
    },
  );

  server.registerTool(
    "list_fonts",
    { title: "List fonts", description: "Fonts a text part can use (the value for its \"font\").", annotations: { readOnlyHint: true } },
    async () => {
      const custom = await loadCustomFonts();
      return text(
        json({
          kinus: Object.entries(FONTS).map(([k, f]) => ({ font: k, name: `${f.label} (${f.sample})` })),
          uploaded: custom.map((f) => ({ font: `custom:${f.id}`, name: f.name, styles: f.files.map((x) => `${x.weight === 700 ? "bold" : "regular"}${x.italic ? " italic" : ""}`) })),
        }),
      );
    },
  );

  server.registerTool(
    "list_label_stock",
    { title: "List label stock", description: "Label sheets and label-printer sizes Kinus knows exactly (Avery, Dymo, Zebra…). Copy a sheet's \"sheet\" into the template's sheet_layout, and its size into page_width_mm/page_height_mm.", inputSchema: { search: z.string().optional().describe("A product number (5160, 8293) or words (round, badge)") }, annotations: { readOnlyHint: true } },
    async ({ search }) =>
      text(
        json(
          findPresets(search ?? "").map((p) => ({
            name: `${p.brand} ${p.product}: ${p.name}`,
            page_width_mm: p.widthMm,
            page_height_mm: p.heightMm,
            round: p.shape === "round",
            sheet: p.sheet ? { ...p.sheet, preset: p.id } : null,
          })),
        ),
      ),
  );

  server.registerTool(
    "longest_values",
    {
      title: "Longest values of each field",
      description: "For each field, the widest real values (the longest first names, last names, bunks, Hebrew names…), how wide each is in average letters, and how many campers have it filled in. Size each part for these.",
      inputSchema: {
        fields: z.array(z.string()).optional().describe('Field keys without braces, e.g. ["FIRST", "HEB_FIRST"]; leave out for every field on the merge list'),
        top: z.number().int().min(1).max(20).default(5),
        for: z.enum(["campers", "staff"]).optional().describe("Whose values: campers (default) or staff"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ fields, top, for: audience }) => {
      if (audience === "staff") {
        const list = await staffLongest(user, fields?.map((f) => f.replace(/[{}]/g, "").trim()), top);
        if (!list.some((f) => f.filled)) return text("No staff yet (or none in your part of camp).");
        return text(json(list.map((f) => ({ field: `{{${f.key}}}`, name: f.label, filled_in_for: f.filled, longest: f.longest }))));
      }
      const list = await longestPerField(scope, { keys: fields?.map((f) => f.replace(/[{}]/g, "").trim()), top });
      if (!list.some((f) => f.filled)) return text("No campers yet (or none in your part of camp).");
      return text(
        json(
          list.map((f) => ({
            field: `{{${f.key}}}`,
            name: f.label,
            filled_in_for: f.filled,
            longest: f.longest.map((l) => ({ value: l.value, width: l.width, letters: l.letters, camper: l.camper })),
          })),
        ),
      );
    },
  );

  server.registerTool(
    "preview_template",
    {
      title: "Preview a template",
      description:
        "A picture of the tag exactly as it prints (front, and back when two-sided; black and white on a thermal printer), filled with a sample or a real camper (a staff member for a staff template), and how each text part fitted. Give template_id, or a draft template (unsaved).",
      inputSchema: {
        template_id: z.guid().optional(),
        template: z.record(z.string(), z.unknown()).optional().describe("A draft template (same JSON as get_template), to preview before saving"),
        camper: z
          .string()
          .optional()
          .describe(
            '"sample" (default); "worst" (every field at once with its longest real value, the fields of one part from one real camper: if this fits, everyone fits); "longest" (the real camper, or staff member, with the longest text on this tag); or a camper code (0012, or a long one like 100016), or for a staff template a staff member\'s name',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const spec = await resolveSpec(input);
        const who = (input.camper ?? "sample").trim().toLowerCase();
        const texts = spec.layers.flatMap((l) => (l.type === "text" && !l.hidden ? [{ text: l.text, w: l.w }] : []));
        let values: Record<string, string>;
        let label = "a sample camper";
        if (spec.audience === "staff") {
          const r = await staffPreview(user, input.camper ?? "sample", texts);
          if ("error" in r) return problem(r.error);
          values = r.values;
          label = r.label;
        } else if (who === "sample") values = await sampleValues();
        else if (who === "worst") {
          const r = await worstCaseValues(scope, texts);
          if ("error" in r) return problem(r.error);
          values = r.values;
          label = r.label;
        } else {
          const r = await camperValues(who === "longest" ? { kind: "longest", texts } : { kind: "code", code: who }, scope);
          if ("error" in r) return problem(r.error);
          values = r.values;
          label = r.label;
        }
        // the design as it stands (a thermal label's page turn is for the printer, not the picture)
        const html = await previewDocument({ ...spec, sheet_layout: null, ...(spec.thermal && spec.page_width_mm > spec.page_height_mm ? { thermal: false, layers: thermalLayers(spec.layers) } : {}) }, [{ values: spec.thermal ? thermalItems(values) : values, copies: 1 }], { outlines: false });
        const { images, fit } = await renderPng(html, { tags: spec.back ? 2 : 1, base: appUrl });
        return {
          content: [
            ...images.map((png) => ({ type: "image" as const, data: png.toString("base64"), mimeType: "image/png" })),
            { type: "text" as const, text: `${spec.name}, ${spec.page_width_mm} × ${spec.page_height_mm} mm, filled with ${label}${spec.back ? " (front, then back)" : ""}.\n${fitReport(fit, spec)}` },
          ],
        };
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "check_fit",
    {
      title: "Check every camper fits",
      description: "Fills the tag with every real camper (every staff member, for a staff template) and reports, per text part, who went under its smallest size or didn't fit at all. Use it to design around long names.",
      inputSchema: { template_id: z.guid().optional(), template: z.record(z.string(), z.unknown()).optional() },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const spec = await resolveSpec(input);
        const staff = spec.audience === "staff";
        const people = staff ? (await staffInView(user)).map((p) => ({ name: p.name, values: p.values })) : await allCamperValues(scope);
        if (!people.length) return text(`No ${staff ? "staff" : "campers"} to check yet (or none in your part of camp).`);
        const textOnly: TemplateSpec = { ...spec, sheet_layout: null, back: null, layers: spec.layers.filter((l) => l.type === "text" && !l.hidden && l.side !== "back") };
        const html = renderDocument(textOnly, people.map((p) => ({ values: p.values, copies: 1 })), { fontCss: await (await import("./custom-fonts")).customFontCss(textOnly) });
        const { fit } = await renderPng(html, { tags: 0, base: appUrl });
        return text(`${people.length} ${staff ? "staff members" : "campers"} checked on ${spec.name}.\n${fitReport(fit, textOnly, people.length)}`);
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "save_template",
    {
      title: "Save a template",
      description:
        "Creates a template (no id) or replaces one (with its id) with this JSON. It's used for printing at once: preview first. A new staff tag: \"audience\": \"staff\". For a thermal label printer: \"thermal\": true. Returns the id and the editor link.",
      inputSchema: { template: z.record(z.string(), z.unknown()).describe("The whole template, as get_template returns it") },
      annotations: { destructiveHint: true },
    },
    async ({ template }) => {
      try {
        const t = { show_on_card: false, auto_on_first_checkin: false, copies: 1, sheet_layout: null, ...template } as Record<string, unknown>;
        // parts need ids: give the new ones one
        if (Array.isArray(t.layers)) t.layers = (t.layers as Record<string, unknown>[]).map((l) => ({ ...l, id: typeof l.id === "string" && l.id ? l.id : Math.random().toString(36).slice(2, 8) }));
        const r = await storeTemplate(t as never);
        return text(`${r.created ? "Created" : "Saved"} “${String(t.name)}” (id ${r.id}). Open it in Kinus: ${editorLink(r.id)}`);
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "copy_template",
    {
      title: "Copy a template",
      description:
        'A copy of a template to work on (the original stays as it is). for: "staff" makes the copy a staff tag: a camper design turned into a staff one, filled from the staff list and printed from Print → Staff tags. Returns the new id.',
      inputSchema: {
        template_id: z.guid(),
        for: z.enum(["campers", "staff"]).optional().describe("Who the copy is for; leave out to keep the same"),
        name: z.string().max(120).optional().describe("The copy's name (default: the original's, marked copy or staff)"),
      },
      annotations: { destructiveHint: false },
    },
    async ({ template_id, for: audience, name }) => {
      try {
        const r = await copyTemplate(template_id, { for: audience, name });
        return text(`Copied as “${r.name}” (id ${r.id})${audience === "staff" ? ", a staff tag: list_fields with for \"staff\" shows what it can say" : ""}. Open it in Kinus: ${editorLink(r.id)}`);
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "upload_link",
    {
      title: "Get a link to upload a big PDF",
      description:
        "For a PDF over about 2.5 MB (too big to send in a call): a one-time link (valid two hours) to put it straight into Kinus' storage, e.g. curl -X PUT -H 'Content-Type: application/pdf' --data-binary @artwork.pdf '<url>'. Then call upload_picture with `uploaded`.",
      inputSchema: {},
    },
    async () => {
      try {
        const { pdfUploadLink } = await import("./pdf-art");
        const { path, url } = await pdfUploadLink();
        return text(
          JSON.stringify({ url, uploaded: path, how: `curl -X PUT -H 'Content-Type: application/pdf' --data-binary @YOUR-FILE.pdf '${url}'`, then: "upload_picture with uploaded (and template_id)" }, null, 1),
        );
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "upload_picture",
    {
      title: "Upload a picture",
      description:
        "A PNG, JPG or WebP (a logo), or a PDF (artwork from InDesign: kept as a PDF, so the PDFs Kinus prints are sharp). use \"part\" returns what an image part needs; use \"background\" (pictures only) puts it behind the whole template_id. For a PDF, give template_id so the PDF's trim/bleed box matching the tag is used; each page comes back as an image part to place. A file over about 2.5 MB doesn't fit in a call: get upload_link, put the file there, then call this with `uploaded`.",
      inputSchema: {
        file_name: z.string(),
        data_base64: z.string().optional().describe("The file, base64 encoded (up to about 2.5 MB; bigger: upload_link)"),
        uploaded: z.string().optional().describe("Instead of data_base64: the `uploaded` path upload_link gave, after the PDF was put there"),
        use: z.enum(["part", "background"]).default("part"),
        template_id: z.guid().optional(),
      },
    },
    async ({ file_name, data_base64, uploaded, use, template_id }) => {
      try {
        const { takeUploadedPdf } = await import("./pdf-art");
        if (!data_base64 && !uploaded) return problem("Give data_base64, or upload the file with upload_link and give `uploaded`.");
        const bytes = uploaded ? Buffer.from(await takeUploadedPdf(uploaded)) : Buffer.from(data_base64!, "base64");
        if (bytes.subarray(0, 5).toString() === "%PDF-") {
          const admin = createAdminClient();
          const tpl = template_id ? (await admin.from("print_templates").select("page_width_mm, page_height_mm").eq("id", template_id).maybeSingle()).data : null;
          const { storePdfArt } = await import("./pdf-art");
          const pages = await storePdfArt(new Uint8Array(bytes), tpl ? { w: Number(tpl.page_width_mm), h: Number(tpl.page_height_mm) } : null);
          return text(
            `Stored ${file_name} (${pages.length} page${pages.length === 1 ? "" : "s"}). Use each page as an image part (keep "pdf" as it is; put it first in "layers" to be under the rest; "side":"back" for the back):\n` +
              JSON.stringify(pages.map((p) => ({ type: "image", path: p.path, pdf: p.pdf, fit: "cover", page_size_mm: [p.widthMm, p.heightMm] })), null, 1),
          );
        }
        const type = bytes.subarray(0, 4).toString("hex") === "89504e47" ? "image/png" : bytes.subarray(0, 3).toString("hex") === "ffd8ff" ? "image/jpeg" : bytes.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
        if (!type) return problem(`${file_name} isn't a PNG, JPG or WebP picture.`);
        if (bytes.length > 4 * 1024 * 1024) return problem("Pictures up to 4 MB, please: save it smaller (JPG, or 300 dpi at the tag's size).");
        const admin = createAdminClient();
        const ext = type.split("/")[1].replace("jpeg", "jpg");
        if (use === "background") {
          if (!template_id) return problem("Say which template_id the background is for.");
          const path = `${template_id}/bg-${Date.now()}.${ext}`;
          const { error } = await admin.storage.from("templates").upload(path, bytes, { contentType: type, upsert: true });
          if (error) throw error;
          const { error: e2 } = await admin.from("print_templates").update({ background_path: path }).eq("id", template_id);
          if (e2) throw e2;
          return text(`Background set on the template. Preview it with preview_template.`);
        }
        const path = `pictures/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await admin.storage.from("templates").upload(path, bytes, { contentType: type, upsert: false });
        if (error) throw error;
        return text(`Uploaded. Use it in an image part: "path": "${path}"`);
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "upload_font",
    {
      title: "Upload a font",
      description: "Adds the designer's own font (TTF, OTF, WOFF or WOFF2): a new font by name, or its bold/italic under the same name. Text parts then use it as \"font\": \"custom:<id>\". Only fonts whose licence allows embedding in printed documents.",
      inputSchema: {
        name: z.string().describe("The font's name, e.g. Camp Display"),
        file_name: z.string(),
        data_base64: z.string().describe("The font file, base64 encoded (up to about 3 MB)"),
        weight: z.union([z.literal(400), z.literal(700)]).default(400),
        italic: z.boolean().default(false),
      },
    },
    async ({ name, file_name, data_base64, weight, italic }) => {
      try {
        const font = await addCustomFont({ name, fileName: file_name, bytes: new Uint8Array(Buffer.from(data_base64, "base64")), weight, italic }, user.id);
        return text(`${font.name} is ready: use "font": "custom:${font.id}".`);
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  return server;
}
