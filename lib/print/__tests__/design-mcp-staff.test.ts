import { describe, expect, it, vi } from "vitest";

// the connector reads the environment on load (before the imports below); nothing here touches the database
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
});
import { DESIGN_GUIDE } from "../design-guide";
import { templateSchema } from "../template-store";

const director = { id: "u1", email: "d@x.com", fullName: "D", role: "director", level: "edit", allAreas: true, areas: [], coverage: [] } as const;

async function connect() {
  const [{ Client }, { InMemoryTransport }, { designServer }] = await Promise.all([
    import("@modelcontextprotocol/sdk/client/index.js"),
    import("@modelcontextprotocol/sdk/inMemory.js"),
    import("../design-mcp"),
  ]);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([designServer(director as never, "https://kinus.example").connect(a), client.connect(b)]);
  return client;
}

describe("design connector: staff tags and thermal printers", () => {
  it("offers copying a design (for staff), and staff fields", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["copy_template", "list_fields", "longest_values", "preview_template", "check_fit", "save_template"]));
    expect(JSON.stringify(tools.find((t) => t.name === "copy_template")!.inputSchema)).toContain("staff");
    const r = (await client.callTool({ name: "list_fields", arguments: { for: "staff" } })) as { content: { text: string }[] };
    const fields = JSON.parse(r.content[0].text).fields as { key: string; sample: string }[];
    expect(fields.map((f) => f.key)).toEqual(expect.arrayContaining(["{{FIRST}}", "{{POSITION}}", "{{DIVISION}}", "{{HEBREW_NAME}}"]));
    expect(fields.every((f) => f.sample)).toBe(true);
  });

  it("a staff or thermal template saves through the same checks", () => {
    const t = { name: "Staff 4×6", kind: "name_tag", page_width_mm: 101.6, page_height_mm: 152.4, layers: [], sheet_layout: null, show_on_card: false, auto_on_first_checkin: false, audience: "staff", thermal: true };
    expect(templateSchema.parse(t)).toMatchObject({ audience: "staff", thermal: true });
    expect(templateSchema.safeParse({ ...t, audience: "teachers" }).success).toBe(false);
  });

  it("the guide tells Claude about both", () => {
    for (const w of ['"audience"', "copy_template", 'for "staff"', '"thermal"', "4×6"]) expect(DESIGN_GUIDE).toContain(w);
  });
});
