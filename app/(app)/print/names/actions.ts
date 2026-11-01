"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { saveHebrewNameFixes, type NameFix } from "@/lib/hebrew-name-review";

const schema = z
  .array(z.object({ camperId: z.guid(), column: z.string().trim().min(1).max(200), value: z.string().trim().max(200) }))
  .min(1)
  .max(2000);

/**
 * Saves fixes to Hebrew-name columns (value "" takes a fix back): lib/hebrew-name-review.
 */
export async function saveNameFixes(input: NameFix[]): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const message = await saveHebrewNameFixes(user, schema.parse(input));
    revalidatePath("/print/names");
    return ok(message);
  } catch (e) {
    return fail(errorMessage(e));
  }
}
