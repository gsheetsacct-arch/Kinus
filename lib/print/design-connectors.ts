import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Links that connect someone's Claude to Kinus for designing templates (the design connector,
 * app/api/mcp). A link stands for the person who made it, and works only while they may edit
 * templates. Kept in settings ("design_connectors") as hashes: the link itself is shown once.
 */
export type DesignConnector = { id: string; hash: string; userId: string; label: string; createdAt: string; usedAt?: string };

const KEY = "design_connectors";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function load(): Promise<DesignConnector[]> {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", KEY).maybeSingle();
  return Array.isArray(data?.value) ? (data.value as unknown as DesignConnector[]) : [];
}
async function save(list: DesignConnector[], by: string | null) {
  const { error } = await createAdminClient()
    .from("settings")
    .upsert({ key: KEY, value: list as never, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** A new link for this person (the secret part is returned once, never stored). */
export async function createConnector(userId: string, label: string, opts: { replace?: boolean } = {}): Promise<{ id: string; token: string }> {
  const token = `kd_${randomBytes(32).toString("base64url")}`;
  const id = randomBytes(6).toString("hex");
  // connecting again (signing in from Claude): the new link takes the place of the last one
  const list = (await load()).filter((c) => !(opts.replace && c.userId === userId && c.label === label.trim().slice(0, 60)));
  if (list.filter((c) => c.userId === userId).length >= 10) throw new Error("That's 10 links already: remove one you don't use first.");
  list.push({ id, hash: sha(token), userId, label: label.trim().slice(0, 60) || "Claude", createdAt: new Date().toISOString() });
  await save(list, userId);
  return { id, token };
}

export async function connectorsOf(userId: string): Promise<Omit<DesignConnector, "hash">[]> {
  return (await load()).filter((c) => c.userId === userId).map((c) => ({ id: c.id, userId: c.userId, label: c.label, createdAt: c.createdAt, usedAt: c.usedAt }));
}

export async function revokeConnector(id: string, userId: string): Promise<void> {
  const list = await load();
  await save(
    list.filter((c) => !(c.id === id && c.userId === userId)),
    userId,
  );
}

/** Whose link this is (null: not a link, or removed). Notes when it was last used, at most hourly. */
export async function connectorUser(token: string): Promise<string | null> {
  if (!/^kd_[\w-]{20,}$/.test(token)) return null;
  const want = Buffer.from(sha(token), "hex");
  const list = await load();
  const hit = list.find((c) => {
    const have = Buffer.from(c.hash, "hex");
    return have.length === want.length && timingSafeEqual(have, want);
  });
  if (!hit) return null;
  if (!hit.usedAt || Date.now() - Date.parse(hit.usedAt) > 3600_000) {
    hit.usedAt = new Date().toISOString();
    await save(list, null).catch(() => undefined);
  }
  return hit.userId;
}
