import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/auth/app-url";
import type { LoginKind } from "./login-kinds";

/** The domain for stand-in addresses: this site's own (never a mailbox anyone reads). */
export async function accountDomain(): Promise<string> {
  const host = new URL(await appUrl()).hostname;
  return host.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : "kinus.app";
}

export const placeholderEmail = async () => `no-email.${randomBytes(5).toString("hex")}@${await accountDomain()}`;
export const checkinEmail = async (name: string) => `checkin.${name}@${await accountDomain()}`;

/** Three short words and a number: easy to read out and type on a phone. */
export function generatePassword() {
  const words = ["camp", "bunk", "sun", "lake", "tent", "fire", "pine", "trail", "star", "canoe", "hike", "song"];
  const pick = () => words[randomBytes(1)[0] % words.length];
  return `${pick()}-${pick()}-${1000 + (randomBytes(2).readUInt16BE(0) % 9000)}`;
}

/**
 * Sets how someone signs in. Listed-only people have their sign-in blocked at Supabase
 * (no link, password or Face ID works), so they only ever appear in lists.
 */
export async function setLoginKind(userId: string, kind: LoginKind) {
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ login: kind }).eq("id", userId);
  if (error) throw error;
  const ban = await admin.auth.admin.updateUserById(userId, { ban_duration: kind === "none" ? "876000h" : "none" });
  if (ban.error && !/not found/i.test(ban.error.message)) throw ban.error;
}
