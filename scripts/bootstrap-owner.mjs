#!/usr/bin/env node
/**
 * One-time: invite the first owner. Needs SUPABASE_SERVICE_ROLE_KEY and
 * NEXT_PUBLIC_SUPABASE_URL in the environment (or a .env.local next to package.json).
 *   npm run bootstrap-owner -- owner@example.com "Full Name"
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
const [email, fullName] = process.argv.slice(2);
if (!email) {
  console.error("usage: npm run bootstrap-owner -- owner@example.com \"Full Name\"");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.APP_URL ?? "http://localhost:3000";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
await admin.from("settings").upsert({ key: "bootstrap_owner", value: { email } });
const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
  data: { full_name: fullName ?? email, global_role: "owner" },
  redirectTo: `${appUrl}/auth/callback?next=/set-password`,
});
if (error) {
  if (/already/i.test(error.message)) {
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const u = users?.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) {
      await admin.from("profiles").upsert({ id: u.id, email, full_name: fullName ?? email, global_role: "owner" });
      console.log(`Existing user ${email} is now owner.`);
      process.exit(0);
    }
  }
  console.error(error.message);
  process.exit(1);
}
console.log(`Invited ${data.user.email} as owner. They will receive an email to set a password.`);
