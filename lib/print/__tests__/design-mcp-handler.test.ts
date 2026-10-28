import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// any lookup would mean the request got past the method check
vi.mock("@/lib/print/design-connectors", () => ({ connectorUser: vi.fn(() => Promise.reject(new Error("looked up a connection"))) }));
vi.mock("@/lib/auth/user-by-id", () => ({ loadUserById: vi.fn() }));
vi.mock("@/lib/print/designers", () => ({ canDesign: vi.fn() }));
vi.mock("@/lib/print/design-mcp", () => ({ designServer: vi.fn() }));

const { designRequest } = await import("../design-mcp-handler");
const unauthorized = () => {
  throw new Error("asked for a sign-in");
};

describe("the design connector", () => {
  it("never opens an event stream: a GET is refused at once, so no function waits out its time limit", async () => {
    const res = await designRequest(new NextRequest("https://kinus.example/api/mcp", { headers: { accept: "text/event-stream" } }), "secret", unauthorized);
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(res.headers.get("content-type") ?? "").not.toContain("text/event-stream");
  });
  it("has no sessions to end", async () => {
    expect((await designRequest(new NextRequest("https://kinus.example/api/mcp", { method: "DELETE" }), "secret", unauthorized)).status).toBe(405);
  });
  it("still answers POSTs (a sign-in check first)", async () => {
    await expect(designRequest(new NextRequest("https://kinus.example/api/mcp", { method: "POST", body: "{}" }), "secret", unauthorized)).rejects.toThrow("looked up a connection");
  });
});
