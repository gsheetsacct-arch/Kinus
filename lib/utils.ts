import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Times are shown in camp's time zone everywhere, so the server (UTC on Vercel) and every
 * phone agree, whatever time zone a device is set to.
 */
export const CAMP_TIME_ZONE = process.env.NEXT_PUBLIC_CAMP_TIMEZONE || "America/New_York";

export function formatTime(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CAMP_TIME_ZONE });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: CAMP_TIME_ZONE });
}

/** "9:42 AM" today, "Mon 9:42 AM" earlier this week, "Jul 3, 9:42 AM" before that. */
export function formatWhen(iso: string | null | undefined, now = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: CAMP_TIME_ZONE });
  if (day(d) === day(now)) return formatTime(iso);
  const days = (now.getTime() - d.getTime()) / 86400000;
  const opts: Intl.DateTimeFormatOptions = days < 6 ? { weekday: "short" } : { month: "short", day: "numeric" };
  return `${d.toLocaleDateString("en-US", { ...opts, timeZone: CAMP_TIME_ZONE })}${days < 6 ? "" : ","} ${formatTime(iso)}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** "+17185550018" → "(718) 555-0018"; other countries as stored. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const us = raw.replace(/[^\d+]/g, "").match(/^(?:\+?1)?(\d{3})(\d{3})(\d{4})$/);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : raw;
}

/** What a tel: link needs: digits and a leading plus. */
export const telHref = (raw: string) => `tel:${raw.replace(/[^\d+]/g, "")}`;

/** "1 bunk", "3 bunks". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
