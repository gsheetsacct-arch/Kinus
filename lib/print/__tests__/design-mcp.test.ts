import { describe, expect, it } from "vitest";
import { DESIGN_GUIDE } from "../design-guide";
import { fontStack, lineHeightOf, CUSTOM_LINE_HEIGHT } from "../font-families";
import { renderDocument } from "../render";

describe("design connector and custom fonts", () => {
  it("the guide covers every kind of part and the workflow", () => {
    for (const w of ["text", "barcode", "qr", "box", "image", "preview_template", "check_fit", "save_template", "custom:<id>", "minSize"]) expect(DESIGN_GUIDE).toContain(w);
  });
  it("an uploaded font is used by name, with the default font behind it", () => {
    expect(fontStack("custom:camp-display")).toMatch(/^"Kinus Custom camp-display","Kinus Sans"/);
    expect(lineHeightOf("custom:camp-display")).toBe(CUSTOM_LINE_HEIGHT);
    const html = renderDocument(
      { name: "t", kind: "name_tag", page_width_mm: 60, page_height_mm: 30, sheet_layout: null, layers: [{ id: "n", type: "text", text: "Hi", x: 0, y: 0, w: 50, h: 10, size: 20, font: "custom:camp-display" }] },
      [{ values: {}, copies: 1 }],
      { fontCss: '@font-face{font-family:"Kinus Custom camp-display"}' },
    );
    expect(html).toContain('@font-face{font-family:"Kinus Custom camp-display"}');
    expect(html).toContain('data-part="n"');
  });
});

import { widthEstimate } from "../width-estimate";
describe("which value needs the most room", () => {
  it("wide letters count more than narrow ones", () => {
    expect(widthEstimate("WMWM")).toBeGreaterThan(widthEstimate("illi"));
    expect(widthEstimate("Menachem Mendel")).toBeGreaterThan(widthEstimate("Menachem"));
    expect(widthEstimate("Yitzchak")).toBeGreaterThan(widthEstimate("Iliiil"));
    expect(widthEstimate("שניאור זלמן")).toBeGreaterThan(widthEstimate("לוי"));
  });
});

describe("Hebrew names on the connector", () => {
  it("lists and fixes Hebrew names, and the guide says how", async () => {
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(16), SUPABASE_SERVICE_ROLE_KEY: "x".repeat(16) });
    const { designServer } = await import("../design-mcp");
    const server = designServer({ id: "u", fullName: "Test", role: "director", coverage: [] } as never, "https://kinus.test");
    const tools = Object.keys((server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools);
    expect(tools).toEqual(expect.arrayContaining(["list_hebrew_names", "fix_hebrew_names", "queue_print_job", "list_print_jobs", "get_print_pdf"]));
    expect(DESIGN_GUIDE).toContain("fix_hebrew_names");
  });
});
