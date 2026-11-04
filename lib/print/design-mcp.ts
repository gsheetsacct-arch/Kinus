import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUsePrintArea, visibleDivisionIds, type CurrentUser } from "@/lib/auth/permissions";
import { FONTS } from "./font-families";
import { addCustomFont, loadCustomFonts } from "./custom-fonts";
import { findPresets, presetById } from "./presets";
import { loadMergeSetup, toSpec } from "./data";
import { copyTemplate, storeTemplate, templateSchema } from "./template-store";
import { activeSession, allCamperValues, camperValues, longestPerField, previewDocument, sampleValues, worstCaseValues } from "./preview-data";
import type { PartFit } from "./pdf";
import { renderPng } from "./chromium";
import { renderDocument } from "./render";
import { thermalLayers, thermalValues } from "./thermal";
import type { Layer, TemplateSpec } from "./types";
import { DESIGN_GUIDE } from "./design-guide";
import { audienceOf, STAFF_FIELDS, type Audience } from "./staff-values";
import { sampleStaffValues, staffInView, staffLongest, staffPreview } from "./staff";
import { canFixNames } from "./name-columns";
import { hebrewNameReview, saveHebrewNameFixes } from "@/lib/hebrew-name-review";
import { isHebrew } from "@/lib/hebrew-names";

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

/** What the connector says about itself first: what Kinus is and where its guide is. */
const KINUS_INTRO = `# The Kinus connector
Kinus runs the Kinus (a camp event): campers from the registration export, staff, check-in, lists, and everything printed (name tags, luggage tags, labels, badges). You act as the person who connected, with only what their account may do.

Help them with anything in Kinus: explain how it works, how to prepare and upload a file (the registration export, a short file of extra details, the staff list), where a setting is, why something looks the way it does, and do what your tools allow.

**Before answering a how-to question, read the Kinus guide**: kinus_guide (no topic: its contents; a topic: that part; "all": everything). It's the same as the Help page in Kinus. It says how Kinus works; what's marked ⚙ Setting is a choice made in Kinus that people change (what each role may do and see, which columns show and to whom, the templates, the office email…): **never state those from the written guide: read kinus_guide("now")**, the actual settings read live, and when they differ, "now" is right. If "now" isn't available to this person, say it's a setting and who can check it. my_access says what this person may do, so your advice fits them. Point them to the page in Kinus (menu → page → section) when they have to do it there.`;

export function designServer(user: CurrentUser, appUrl: string, opts: { designer?: boolean } = {}): McpServer {
  // everyone with their own sign-in connects; the template tools only for those who may edit templates
  const designer = opts.designer ?? true;
  const server = new McpServer({ name: "kinus", version: "2.0.0" }, { instructions: designer ? `${KINUS_INTRO}\n\n${DESIGN_GUIDE}` : KINUS_INTRO });
  const scope = visibleDivisionIds(user);
  const editorLink = (id: string) => `${appUrl}/print/templates/${id}`;
  // the template tools: registered only for people who may edit templates
  const design = (designer ? server.registerTool.bind(server) : () => undefined) as typeof server.registerTool;

  server.registerTool(
    "kinus_guide",
    {
      title: "The Kinus guide",
      description:
        "How everything in Kinus is set up and how to do each job (the Help page): imports and the registration export, adding a short file of details, registration columns and who sees them, Hebrew names, divisions and bunks, check-in, printing and the queue, the templates (their paper and what's on each), lists and layouts, staff, search and the activity log, settings, connecting an AI. No topic: the contents; a topic id: that part; \"all\": everything. Read it before explaining how to do something.",
      inputSchema: { topic: z.string().max(40).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ topic }) => {
      const { guideContents, guideText, LIVE_SECTION } = await import("@/lib/help/guide");
      const { canSeeHelp } = await import("@/lib/help/access");
      // "now": this camp's actual settings, read live (for the people who set Kinus up)
      const live = canSeeHelp(user);
      const liveText = async () => `## ${LIVE_SECTION.title}\n${await (await import("@/lib/help/live")).liveSetup()}`;
      if (!topic)
        return text(
          `# The Kinus guide\nAsk for a topic (or "all"). The guide says how Kinus works; parts marked ⚙ Setting are choices made in Kinus${live ? ': their actual current values are in "now"' : " (ask a director what's set)"}.\n${guideContents(live)}`,
        );
      if (topic === "now") return live ? text(await liveText()) : problem("How it's set up here (the roles, columns, templates, settings) is for directors, the office and logistics: ask one of them, or see your own access with my_access.");
      const body = guideText(topic === "all" ? null : topic);
      if (!body) return problem(`No such topic. The topics:\n${guideContents(live)}`);
      return text(topic === "all" && live ? `${await liveText()}\n\n${body}` : body);
    },
  );

  server.registerTool(
    "my_access",
    { title: "What this person may do", description: "The connected person's role, level (view, check in & out, edit), the part of camp they look after, and which kinds of detail and tools they have, so advice fits them.", annotations: { readOnlyHint: true } },
    async () => {
      const { STAFF_ROLES } = await import("@/lib/labels");
      const { createAdminClient: admin } = await import("@/lib/supabase/admin");
      const { visibleFieldGroups, canUsePrintArea: printArea, isAdmin, isDirector } = await import("@/lib/auth/permissions");
      const { data: fv } = await admin().from("field_visibility").select("field_group, roles");
      const ids = visibleDivisionIds(user);
      const { data: divs } = ids ? await admin().from("divisions").select("name").in("id", ids) : { data: null };
      return text(
        json({
          name: user.fullName,
          role: STAFF_ROLES[user.role]?.label ?? user.role,
          level: user.role === "owner" ? "edit" : user.level,
          area: ids ? (divs ?? []).map((d) => d.name) : "all of camp",
          sees: [...visibleFieldGroups(user, fv ?? [])],
          can: {
            camp_setup_imports_settings: isAdmin(user),
            directors_pages_activity_log: isDirector(user),
            print_queue_and_batches: printArea(user),
            edit_templates: designer,
            fix_hebrew_names: canFixNames(user),
          },
        }),
      );
    },
  );

  design("design_guide", { title: "How Kinus templates work", description: "The template format, the parts, fonts and how to design around long names. Read this first.", annotations: { readOnlyHint: true } }, async () => text(DESIGN_GUIDE));

  design(
    "list_templates",
    { title: "List templates", description: "Every template: id, name, its folder on Print → Templates (null: none), who it's for (campers or staff), size, label stock, thermal printer, camps. In the order the page lists them.", annotations: { readOnlyHint: true } },
    async () => {
      const { data } = await createAdminClient().from("print_templates").select("*").order("sort_order").order("name");
      return text(
        json(
          (data ?? []).map((t) => {
            const sheet = t.sheet_layout as { preset?: string; cols?: number; rows?: number } | null;
            return {
              id: t.id,
              name: t.name,
              folder: (t as { folder?: string | null }).folder ?? null,
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

  design(
    "organize_templates",
    {
      title: "Organize templates",
      description:
        "Tidies Print → Templates: put templates in folders (folder: a name; null or \"\" takes one out of its folder; a new name makes a new folder), rename templates (name), rename or empty a folder (renames), and set the order they're listed in (order: template ids, first to last; each folder lists its templates in this order). Folders are listed A–Z. Look with list_templates first; every change is recorded in the activity log.",
      inputSchema: {
        moves: z.array(z.object({ template_id: z.guid(), folder: z.string().max(60).nullable().optional(), name: z.string().min(1).max(120).optional() })).max(200).optional(),
        renames: z.array(z.object({ from: z.string().min(1).max(60), to: z.string().max(60).nullable() })).max(20).optional(),
        order: z.array(z.guid()).max(500).optional(),
      },
    },
    async ({ moves, renames, order }) => {
      try {
        const { organizeTemplates } = await import("./folders");
        return text(await organizeTemplates({ moves, renames, order }));
      } catch (e) {
        return problem(e instanceof Error ? e.message : "Couldn't organize the templates.");
      }
    },
  );

  design(
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

  design(
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

  design(
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

  design(
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

  design(
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

  design(
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

  design(
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

  design(
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

  design(
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

  design(
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

  design(
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

  design(
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

  server.registerTool(
    "list_hebrew_names",
    {
      title: "Hebrew names to fix",
      description:
        'The campers\' Hebrew names (the export columns Hebrew-name fields read) that aren\'t right yet: typed in English or spelled out ("english"), or empty; with the English name and Kinus\' suggestion. show "fixed" lists the fixes already made, "all" everyone (to check names already in Hebrew). Fix them with fix_hebrew_names.',
      inputSchema: {
        show: z.enum(["needs_fixing", "english", "empty", "fixed", "all"]).default("needs_fixing"),
        division: z.string().optional().describe("Only this division (its name)"),
        limit: z.number().int().min(1).max(1000).default(300),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ show, division, limit, offset }) => {
      try {
        if (!canFixNames(user)) return problem(`${user.fullName} can't fix names (it takes edit access to printing).`);
        const session = await activeSession();
        if (!session) return problem("No active session.");
        const { columns, rows, migrated } = await hebrewNameReview(user, session.id, { everyone: show === "all" });
        if (!columns.length) return text("No label field reads a Hebrew name from the export yet (Fields & conversions: e.g. Hebrew name → the export's hebrew_name column).");
        const wanted = rows.filter((r) => r.canFix && (!division || (r.divisionName ?? "").toLowerCase() === division.trim().toLowerCase()) && (show === "all" || (show === "needs_fixing" ? r.state === "english" || r.state === "empty" : r.state === show)));
        const count = (st: string | null) => rows.filter((r) => r.canFix && r.state === st).length;
        const page = wanted.slice(offset, offset + limit).map((r) => ({
          camper_id: r.camperId,
          name: r.name,
          where: r.where,
          column: r.column,
          field: r.columnLabel,
          kind: r.kind,
          registration: r.registration,
          state: r.state ?? "hebrew",
          ...(r.fix ? { fixed_to: r.fix.value } : {}),
          ...(r.suggestion ? { suggestion: r.suggestion.value, how: r.suggestion.how } : {}),
        }));
        return text(
          json({
            session: session.name,
            columns: columns.map((c) => ({ column: c.column, field: c.label, kind: c.kind })),
            totals: { english: count("english"), empty: count("empty"), fixed: count("fixed") },
            showing: `${page.length ? offset + 1 : 0}–${offset + page.length} of ${wanted.length}`,
            ...(migrated ? {} : { warning: "Fixes can't be saved until migration 0034 has run." }),
            rows: page,
          }),
        );
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "fix_hebrew_names",
    {
      title: "Fix Hebrew names",
      description:
        'Saves campers\' Hebrew names (camper_id and column from list_hebrew_names): Hebrew letters only, final letters at the ends of words. value "" takes a fix back (the registration\'s text prints again). Tags print the fix at once and new uploads keep it, the same as fixing on Print → Hebrew names.',
      inputSchema: {
        fixes: z
          .array(z.object({ camper_id: z.guid(), column: z.string().trim().min(1).max(200), value: z.string().trim().max(200) }))
          .min(1)
          .max(1000),
      },
      annotations: { destructiveHint: true },
    },
    async ({ fixes }) => {
      try {
        if (!canFixNames(user)) return problem(`${user.fullName} can't fix names (it takes edit access to printing).`);
        const notHebrew = fixes.filter((f) => f.value && !isHebrew(f.value));
        if (notHebrew.length) return problem(`Hebrew letters only (nothing saved). Not Hebrew: ${notHebrew.slice(0, 5).map((f) => `${f.camper_id} "${f.value}"`).join(", ")}`);
        const message = await saveHebrewNameFixes(user, fixes.map((f) => ({ camperId: f.camper_id, column: f.column, value: f.value })));
        return text(message);
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "queue_print_job",
    {
      title: "Add a print job to the queue",
      description:
        'Asks for tags of a camper template, the same as Print a batch: for everyone you can print for, a camp (all its divisions, in one job), a division, a bunk, or some campers (by camper code). which: "not_printed" (default: only campers who never got this tag), "changed" (new, and anyone whose details on this tag changed since printed), "all", "present" (checked in now), "arrived_today". order: "bunk" (default), "division" or "name". deliver: "queue" (waits in Print → Queue for the office to print) or "email" (the PDF is made and emailed, to email_to or the office). Use dry_run first to see how many and who.',
      inputSchema: {
        template_id: z.guid(),
        camp: z.string().optional().describe('A camp\'s name ("American"): all its divisions in one job. Not with division'),
        division: z.string().optional().describe("A division's name (leave out for everyone)"),
        bunk: z.string().optional().describe("A bunk's name (in division, when given)"),
        camper_codes: z.array(z.string()).max(2000).optional().describe("Instead of a place: these campers (their 4-digit codes)"),
        which: z.enum(["not_printed", "changed", "all", "present", "arrived_today"]).default("not_printed"),
        order: z.enum(["bunk", "division", "name"]).default("bunk"),
        copies: z.number().int().min(1).max(10).optional().describe("Of each (default: the template's usual number)"),
        purpose: z.string().max(200).optional().describe("What it is and what it's for, shown in the queue and the email"),
        deliver: z.enum(["queue", "email"]).default("queue"),
        email_to: z.string().optional().describe('With deliver "email": the address (default: the office)'),
        dry_run: z.boolean().default(false).describe("Only count and list who, without asking"),
      },
      annotations: { destructiveHint: false },
    },
    async ({ template_id, camp, division, bunk, camper_codes, which, order, copies, purpose, deliver, email_to, dry_run }) => {
      try {
        if (!canUsePrintArea(user)) return problem(`${user.fullName} can't ask for prints (printing is for the office, directors and division heads).`);
        const session = await activeSession();
        if (!session) return problem("No active session.");
        const admin = createAdminClient();
        const { data: tpl } = await admin.from("print_templates").select("id, name").eq("id", template_id).maybeSingle();
        if (!tpl) return problem("No template with that id (list_templates).");
        let ids: string[];
        let place: string;
        if (camper_codes?.length) {
          const codes = [...new Set(camper_codes.map((c) => c.trim()).filter(Boolean))];
          const { data } = await admin.from("campers").select("id, camper_code, division_id").eq("session_id", session.id).is("archived_at", null).in("camper_code", codes);
          const found = (data ?? []).filter((c) => !scope || (c.division_id && scope.includes(c.division_id)));
          const missing = codes.filter((code) => !found.some((c) => c.camper_code === code));
          if (missing.length) return problem(`No camper of yours with code ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}.`);
          ids = found.map((c) => c.id);
          place = `${ids.length} chosen`;
        } else {
          const { data: divs } = await admin.from("divisions").select("id, name, bunks(id, name)").eq("session_id", session.id);
          const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
          const d = division ? (divs ?? []).find((x) => same(x.name, division)) : undefined;
          if (division && !d) return problem(`No division called "${division}". Divisions: ${(divs ?? []).map((x) => x.name).join(", ")}.`);
          const bunks = (d ? [d] : (divs ?? [])).flatMap((x) => (x.bunks as { id: string; name: string }[]).map((b) => ({ ...b, division: x.name })));
          const b = bunk ? bunks.filter((x) => same(x.name, bunk)) : [];
          if (bunk && b.length !== 1) return problem(b.length ? `More than one bunk is called "${bunk}": say the division too.` : `No bunk called "${bunk}"${d ? ` in ${d.name}` : ""}.`);
          // a camp: all its divisions (a division with no camp is in the first, as everywhere)
          let inCamp: string[] | null = null;
          if (camp && !division) {
            const { campDivisions } = await import("./template-camps");
            const camps = await campDivisions(admin, session.id);
            const c = camps.find((x) => same(x.name, camp));
            if (!c) return problem(`No camp called "${camp}". Camps: ${camps.map((x) => x.name).join(", ")}.`);
            inCamp = scope ? c.divisionIds.filter((x) => scope.includes(x)) : c.divisionIds;
            if (!inCamp.length) return text(`No campers of yours in ${c.name}: nothing to print.`);
          }
          const { batchCamperIds } = await import("./batch");
          ids = await batchCamperIds(admin, session.id, { divisionIds: inCamp ?? scope, divisionId: d?.id, bunkId: b[0]?.id }, which, template_id);
          place = b[0] ? `${b[0].division} · ${b[0].name}` : d ? d.name : inCamp ? `All of ${camp}` : "Everyone";
        }
        if (!ids.length) return text(`No campers match (${place}, ${which}): nothing to print.`);
        if (ids.length > 2000) return problem("That's more than 2,000 tags: one division at a time.");
        if (dry_run) {
          const { data: some } = await admin.from("campers").select("first_name, last_name").in("id", ids.slice(0, 15));
          return text(`${ids.length} campers would get “${tpl.name}” (${place}, ${which}, by ${order}): ${(some ?? []).map((c) => `${c.first_name} ${c.last_name}`).join(", ")}${ids.length > 15 ? "…" : ""}`);
        }
        const { createPrintJob, processPrintJob } = await import("./jobs");
        const WHICH: Record<string, string | null> = { all: null, not_printed: "not printed before", changed: "new or changed", present: "here now", arrived_today: "arrived today" };
        const job = await createPrintJob(user, {
          sessionId: session.id,
          templateId: template_id,
          camperIds: ids,
          copies,
          deliverTo: deliver === "email" ? email_to?.trim() || null : user.email,
          note: [purpose, place, WHICH[which], "asked through Claude"].filter(Boolean).join(" · "),
          order,
        });
        if (deliver === "email") {
          const { after } = await import("next/server");
          after(() => processPrintJob(job.id, appUrl));
        } else await admin.from("print_jobs").update({ status: "ready" }).eq("id", job.id);
        return text(`${deliver === "email" ? "Asked: the PDF is being made and emailed" : "Added to the print queue"}: ${job.count} × “${tpl.name}”${job.copies > 1 ? ` (${job.copies} of each)` : ""}, ${place}. ${appUrl}/print/jobs/${job.id}`);
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "delete_print_job",
    {
      title: "Take print jobs off the queue",
      description:
        "Takes print jobs off the queue (Print → Queue): only ones this person asked for, through Claude or Kinus, that aren't printed yet. They show as cancelled; the tags count as never printed. Job ids from list_print_jobs or queue_print_job's link.",
      inputSchema: { job_ids: z.array(z.guid()).min(1).max(100) },
      annotations: { destructiveHint: true },
    },
    async ({ job_ids }) => {
      try {
        if (!canUsePrintArea(user)) return problem(`${user.fullName} can't change the print queue.`);
        const admin = createAdminClient();
        const { data: jobs } = await admin.from("print_jobs").select("id, status, requested_by, item_count, print_templates(name)").in("id", job_ids);
        const found = jobs ?? [];
        const notMine = found.filter((j) => j.requested_by !== user.id);
        const printed = found.filter((j) => j.requested_by === user.id && j.status === "printed");
        const take = found.filter((j) => j.requested_by === user.id && j.status !== "printed" && j.status !== "cancelled").map((j) => j.id);
        if (take.length) {
          const { error } = await admin.from("print_jobs").update({ status: "cancelled" }).in("id", take).neq("status", "printed");
          if (error) throw error;
        }
        const missing = job_ids.filter((id) => !found.some((j) => j.id === id));
        return text(
          [
            `${take.length} taken off the queue.`,
            printed.length ? `${printed.length} already printed (kept).` : "",
            notMine.length ? `${notMine.length} asked for by someone else (kept: only their own can be taken off here).` : "",
            missing.length ? `${missing.length} not found.` : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "list_print_jobs",
    {
      title: "Print jobs",
      description: "The latest print requests (newest first) this person may open: id, tag, how many, status, note, and whether a PDF was made. get_print_pdf gives a download link.",
      inputSchema: { limit: z.number().int().min(1).max(50).default(15), status: z.enum(["any", "open", "printed"]).default("any").describe('"open": not printed yet') },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, status }) => {
      try {
        const session = await activeSession();
        if (!session) return problem("No active session.");
        const admin = createAdminClient();
        let q = admin.from("print_jobs").select("id, status, item_count, note, requested_at, pdf_path, requested_by, print_order, print_templates(name), profiles:requested_by(full_name)").eq("session_id", session.id).order("requested_at", { ascending: false }).limit(limit * 3);
        if (status === "open") q = q.not("status", "in", "(printed,cancelled)");
        if (status === "printed") q = q.eq("status", "printed");
        const { data } = await q;
        const { jobsVisibleTo } = await import("./access");
        const mine: unknown[] = [];
        for (const j of data ?? []) {
          if (mine.length >= limit) break;
          if (!(await jobsVisibleTo(user, [j.id]))) continue;
          mine.push({
            id: j.id,
            tag: (j.print_templates as { name: string } | null)?.name ?? "(deleted template)",
            campers: j.item_count,
            status: j.status,
            order: j.print_order,
            note: j.note,
            asked: j.requested_at,
            by: (j.profiles as { full_name: string } | null)?.full_name ?? null,
            pdf_made: Boolean(j.pdf_path),
          });
        }
        return text(mine.length ? json(mine) : "No print requests yet.");
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "get_print_pdf",
    {
      title: "Download a print job's PDF",
      description:
        "A download link (valid 24 hours) to a print request's PDF, in the order it was asked for. An emailed request's PDF as it was sent; otherwise it's made now. A big request is made in parts (about 200 tags each): the answer says how many; ask for each with part 0, 1, ….",
      inputSchema: { job_id: z.guid(), part: z.number().int().min(0).optional().describe("For a big request: which part (from 0)") },
      annotations: { readOnlyHint: true },
    },
    async ({ job_id, part }) => {
      try {
        const { jobsVisibleTo } = await import("./access");
        if (!(await jobsVisibleTo(user, [job_id]))) return problem("No print request with that id that you may open (list_print_jobs).");
        const admin = createAdminClient();
        const out = admin.storage.from("print-output");
        const { data: job } = await admin.from("print_jobs").select("pdf_path, print_templates(name)").eq("id", job_id).maybeSingle();
        const name = ((job?.print_templates as { name: string } | null)?.name ?? "Tags").replace(/[\\/:*?"<>|]+/g, "-");
        if (job?.pdf_path && part === undefined) {
          const { data, error } = await out.createSignedUrl(job.pdf_path, 86400, { download: `${name}.pdf` });
          if (error) throw error;
          return text(`The PDF as it was emailed: ${data.signedUrl}\n(link valid 24 hours)`);
        }
        const { printSetPdf } = await import("./jobs");
        const r = await printSetPdf([job_id], { part: part ?? 0 });
        const path = `claude/${job_id}-${part ?? 0}.pdf`;
        const { error: up } = await out.upload(path, r.pdf, { contentType: "application/pdf", upsert: true });
        if (up) throw up;
        const file = r.parts > 1 ? r.fileName.replace(/\.pdf$/, ` (part ${(part ?? 0) + 1} of ${r.parts}).pdf`) : r.fileName;
        const { data, error } = await out.createSignedUrl(path, 86400, { download: file });
        if (error) throw error;
        return text(`${file}: ${data.signedUrl}\n(link valid 24 hours)${r.parts > 1 ? `\nThis request is in ${r.parts} parts: ask for part ${(part ?? 0) + 1 < r.parts ? (part ?? 0) + 1 : 0}… up to ${r.parts - 1}. Or print it whole from Kinus: ${appUrl}/print/jobs/${job_id}` : ""}`);
      } catch (e) {
        return problem(e instanceof Error ? e.message : String(e));
      }
    },
  );

  return server;
}
