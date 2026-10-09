import { describe, it, expect } from "vitest";
import { authRedirect } from "../redirects";

const prod = { canonical: "https://kinus.vercel.app", production: true };
const r = (u: string, env: { canonical: string | null; production: boolean } = prod) => authRedirect(new URL(u), env);

describe("authRedirect", () => {
  it("sends other production hosts to the canonical address, keeping path and query", () => {
    expect(r("https://kinus-kinus1.vercel.app/login?next=%2Fset-password")).toBe("https://kinus.vercel.app/login?next=%2Fset-password");
    expect(r("https://kinus-abc123-kinus1.vercel.app/campers?q=x")).toBe("https://kinus.vercel.app/campers?q=x");
  });
  it("leaves the canonical host, previews, API routes and unset config alone", () => {
    expect(r("https://kinus.vercel.app/campers")).toBeNull();
    expect(r("https://kinus-git-branch-kinus1.vercel.app/campers", { ...prod, production: false })).toBeNull();
    expect(r("https://kinus-kinus1.vercel.app/api/cron/x")).toBeNull();
    expect(r("https://kinus-kinus1.vercel.app/campers", { canonical: null, production: true })).toBeNull();
  });
  it("forwards a stray ?code= to the callback, remembering where it landed", () => {
    expect(r("https://kinus.vercel.app/?code=abc")).toBe("https://kinus.vercel.app/auth/callback?code=abc&next=%2F");
    expect(r("https://kinus.vercel.app/login?code=abc&next=/set-password")).toBe("https://kinus.vercel.app/auth/callback?code=abc&next=%2Fset-password");
    expect(r("https://kinus.vercel.app/auth/callback?code=abc")).toBeNull();
  });
  it("forwards a stray token_hash to the confirm handler", () => {
    expect(r("https://kinus.vercel.app/?token_hash=t&type=invite")).toBe("https://kinus.vercel.app/auth/confirm?token_hash=t&type=invite");
  });
  it("fixes the host first, then the parameters on the next request", () => {
    expect(r("https://kinus-kinus1.vercel.app/?code=abc")).toBe("https://kinus.vercel.app/?code=abc");
  });
});
