import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sign-in for the design connector at one fixed address (/api/mcp): an organization adds that
 * address to Claude once, and each person connects it to their own Kinus account (OAuth 2.1
 * with PKCE, as Claude's connectors do it). Nothing new is stored for it: an app's registration
 * and a one-time code are signed by Kinus, and what Claude gets in the end is an ordinary
 * design link (lib/print/design-connectors), listed with the person's links and removable there.
 */
const secret = () => createHash("sha256").update(`kinus-oauth|${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest();
const mac = (s: string) => createHmac("sha256", secret()).update(s).digest("base64url");

function seal(kind: string, data: object): string {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${mac(`${kind}|${body}`)}`;
}
function open<T>(kind: string, sealed: string): T | null {
  const [body, sig] = sealed.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(`${kind}|${body}`));
  const have = Buffer.from(sig);
  if (want.length !== have.length || !timingSafeEqual(want, have)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as T;
  } catch {
    return null;
  }
}

/** Where Claude may be sent back to: Claude's own sites, or this computer (Claude Code, the desktop app). */
export function allowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:" && /(^|\.)claude\.(ai|com)$/.test(u.hostname)) return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export type OAuthClient = { name: string; redirect_uris: string[] };

/** A registration (RFC 7591): the app's details, signed, are its client_id. */
export function registerClient(c: OAuthClient): string {
  return `kc_${seal("client", { n: c.name.slice(0, 80), r: c.redirect_uris })}`;
}
export function readClient(clientId: string): OAuthClient | null {
  const c = clientId.startsWith("kc_") ? open<{ n: string; r: string[] }>("client", clientId.slice(3)) : null;
  return c ? { name: c.n, redirect_uris: c.r } : null;
}

type Code = { u: string; c: string; r: string; p: string; e: number };

/** A code for this person's go-ahead, good for 5 minutes, only with the PKCE verifier. */
export function issueCode(userId: string, clientId: string, redirectUri: string, challenge: string): string {
  return seal("code", { u: userId, c: createHash("sha256").update(clientId).digest("base64url"), r: redirectUri, p: challenge, e: Date.now() + 5 * 60_000 } satisfies Code);
}

/** Whose go-ahead a code is (null: not valid, too old, or not for this app, address or verifier). */
export function redeemCode(code: string, clientId: string, redirectUri: string, verifier: string): string | null {
  const c = open<Code>("code", code);
  if (!c || c.e < Date.now()) return null;
  if (c.c !== createHash("sha256").update(clientId).digest("base64url") || c.r !== redirectUri) return null;
  if (!/^[\w.~-]{43,128}$/.test(verifier) || createHash("sha256").update(verifier).digest("base64url") !== c.p) return null;
  return c.u;
}
