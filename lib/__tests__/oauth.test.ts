import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { allowedRedirect, issueCode, readClient, redeemCode, registerClient } from "../oauth";

const verifier = "v".repeat(43) + "erifier-abc";
const challenge = createHash("sha256").update(verifier).digest("base64url");
const back = "https://claude.ai/api/mcp/auth_callback";

describe("connecting Claude with a sign-in", () => {
  it("takes only Claude's own return addresses", () => {
    expect(allowedRedirect(back)).toBe(true);
    expect(allowedRedirect("https://claude.com/api/mcp/auth_callback")).toBe(true);
    expect(allowedRedirect("http://localhost:33418/callback")).toBe(true);
    expect(allowedRedirect("https://evil.example/cb")).toBe(false);
    expect(allowedRedirect("https://claude.ai.evil.example/cb")).toBe(false);
    expect(allowedRedirect("http://claude.ai/cb")).toBe(false);
  });
  it("a registration reads back, and can't be altered", () => {
    const id = registerClient({ name: "Claude", redirect_uris: [back] });
    expect(readClient(id)).toEqual({ name: "Claude", redirect_uris: [back] });
    const [body, sig] = id.slice(3).split(".");
    const forged = Buffer.from(JSON.stringify({ n: "Claude", r: ["https://evil.example/cb"] })).toString("base64url");
    expect(readClient(`kc_${forged}.${sig}`)).toBeNull();
    expect(readClient(`kc_${body}.x${sig.slice(1)}`)).toBeNull();
  });
  it("a code works only for its app, return address and verifier", () => {
    const id = registerClient({ name: "Claude", redirect_uris: [back] });
    const other = registerClient({ name: "Other", redirect_uris: [back] });
    const code = issueCode("user-1", id, back, challenge);
    expect(redeemCode(code, id, back, verifier)).toBe("user-1");
    expect(redeemCode(code, other, back, verifier)).toBeNull();
    expect(redeemCode(code, id, "http://localhost:1/cb", verifier)).toBeNull();
    expect(redeemCode(code, id, back, verifier.replace("abc", "abd"))).toBeNull();
    expect(redeemCode(code.replace(/.$/, (c) => (c === "A" ? "B" : "A")), id, back, verifier)).toBeNull();
  });
});
