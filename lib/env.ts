import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Kinus <no-reply@example.com>"),
  APP_URL: z.string().url(),
  CRON_SECRET: z.string().optional(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;
/** Server-only. Throws with a readable message if a required variable is missing. */
export function serverEnv() {
  if (!cachedServerEnv) {
    // On Vercel the production URL is known without configuration.
    const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
    const APP_URL = process.env.APP_URL || (vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000");
    cachedServerEnv = serverSchema.parse({ ...process.env, APP_URL });
  }
  return cachedServerEnv;
}
