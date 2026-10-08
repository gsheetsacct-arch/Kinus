export type ActionResult = { ok: true; message?: string; redirect?: string } | { ok: false; error: string };

export const ok = (message?: string, redirect?: string): ActionResult => ({ ok: true, message, redirect });
export const fail = (error: string): ActionResult => ({ ok: false, error });

/** Turns a thrown error (zod, Postgres, Supabase) into a readable message. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const anyE = e as { message?: string; issues?: { message: string; path: (string | number)[] }[]; details?: string };
    if (anyE.issues?.length) return anyE.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    if (anyE.message) return anyE.message.replace(/^.*?: /, "");
  }
  return String(e);
}
