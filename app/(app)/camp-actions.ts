"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { ALL_CAMPS, CAMP_COOKIE } from "@/lib/data/camp";

/** Switch the camp this device is looking at. */
export async function setCamp(campId: string) {
  await requireUser();
  const value = campId === ALL_CAMPS || /^[0-9a-f-]{36}$/i.test(campId) ? campId : "";
  (await cookies()).set(CAMP_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  revalidatePath("/", "layout");
}
