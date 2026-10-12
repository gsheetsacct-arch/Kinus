"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ActionForm } from "@/components/action-form";
import { cn } from "@/lib/utils";
import { STAFF_ROLES } from "@/lib/labels";
import { shownEmail, type LoginKind } from "@/lib/staff/login-kinds";
import type { AccessLevel, StaffRole } from "@/lib/auth/permissions";
import type { AreaTree } from "@/lib/data/areas";
import type { ActionResult } from "@/lib/actions/result";
import { WherePicker } from "./where-picker";

export type PersonFormValues = {
  id?: string;
  full_name: string;
  email: string;
  phone: string;
  /** Free-text position: "Learning head", "Waterfront". */
  title: string;
  role: StaffRole;
  access_level: AccessLevel;
  all_areas: boolean;
  areas: string[];
  /** personal: signs in with their email · none: listed only · shared: a division's check-in login */
  login?: LoginKind;
};

/** One form for everything about a person: who they are, their role (what they can do), and where. */
export function PersonForm({
  person,
  roles,
  tree,
  action,
  submitLabel,
  lockAll,
  readOnly,
  isNew,
  summaries,
}: {
  person: PersonFormValues;
  roles: StaffRole[];
  tree: AreaTree;
  action: (fd: FormData) => Promise<ActionResult>;
  submitLabel: string;
  lockAll?: boolean;
  readOnly?: boolean;
  isNew?: boolean;
  /** What each role can do and see ("Check in & out · sees contacts"), from Staff → Roles. */
  summaries: Partial<Record<StaffRole, string>>;
}) {
  const [role, setRole] = React.useState<StaffRole>(person.role);
  // counselors are usually listed only (phone book, bunk); everyone else signs in
  const [login, setLogin] = React.useState<LoginKind>(person.login ?? (isNew && person.role === "counselor" ? "none" : "personal"));
  const listed = login === "none";
  const shared = login === "shared";
  const ordered = [...roles].sort((a, b) => FORM_ORDER.indexOf(a) - FORM_ORDER.indexOf(b));
  const locked = readOnly && "pointer-events-none opacity-70";
  return (
    <ActionForm action={action} className="divide-y">
      {person.id && <input type="hidden" name="id" value={person.id} />}

      <Row label="Who">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" htmlFor="full_name">
            <Input id="full_name" name="full_name" defaultValue={person.full_name} required dir="auto" disabled={readOnly} />
          </Field>
          <Field label="Phone (optional)" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" defaultValue={person.phone} disabled={readOnly} />
          </Field>
          <Field label="Position (optional)" htmlFor="title" hint="What they do at camp, e.g. Learning head, Waterfront. Shown in the phone book." className="sm:col-span-2">
            <Input id="title" name="title" defaultValue={person.title} maxLength={80} dir="auto" disabled={readOnly} />
          </Field>
        </div>
      </Row>

      <Row label="Role">
        <div className={cn("flex flex-wrap gap-2", locked)} role="radiogroup" aria-label="Role">
          {ordered.map((r) => (
            <label key={r} className="cursor-pointer">
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => {
                  setRole(r);
                  if (isNew) setLogin(r === "counselor" ? "none" : "personal");
                }}
                className="peer sr-only"
              />
              <span className="inline-flex min-h-9 items-center rounded-full border bg-card px-3.5 py-1 text-sm text-foreground/80 hover:bg-muted peer-checked:border-primary peer-checked:bg-primary peer-checked:font-medium peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                {STAFF_ROLES[r].label}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {STAFF_ROLES[role].description}
          {summaries[role] && <span className="font-medium text-foreground/80"> {summaries[role]}.</span>}
        </p>
      </Row>

      {role !== "owner" && (
        <Row label="Where">
          <WherePicker tree={tree} role={role} defaultAll={person.all_areas} defaultAreas={person.areas} lockAll={lockAll} readOnly={readOnly} />
        </Row>
      )}

      <Row label="Signing in">
        {shared ? (
          <p className="text-sm text-muted-foreground">
            This is the check-in login shared by a division&apos;s check-in phones. Its password is set under <strong>Check-in logins</strong> on the Staff page.
          </p>
        ) : (
          <div className="space-y-3">
            {role !== "owner" && (
              <div className={cn("inline-flex w-full flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-auto", locked)}>
                <input type="hidden" name="login" value={login} />
                {(
                  [
                    ["personal", "Signs in to Kinus"],
                    ["none", "Listed only"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex-1 cursor-pointer sm:flex-none">
                    <input type="radio" checked={login === k} onChange={() => setLogin(k)} className="peer sr-only" />
                    <span className="block rounded-md px-3 py-1.5 text-center text-sm text-muted-foreground peer-checked:bg-background peer-checked:font-medium peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {listed
                ? "In the phone book and on their bunk so head staff can reach them. They don't sign in."
                : "With their own email: a link, a password or Face ID."}
            </p>
            <Field label={listed ? "Email (optional)" : "Email"} htmlFor="email" className="max-w-md">
              <Input id="email" name="email" type="email" defaultValue={shownEmail(person.email) ?? ""} required={!listed} disabled={readOnly || (!isNew && !listed && person.login !== "none")} />
            </Field>
            {isNew && !listed && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="invite" defaultChecked className="mt-0.5 size-4" />
                <span>
                  Email them an invitation now
                  <span className="block text-xs text-muted-foreground">They click the link, choose a password, and they&apos;re in.</span>
                </span>
              </label>
            )}
          </div>
        )}
      </Row>

      {!readOnly && (
        <div className="pt-5">
          <Button type="submit" size="lg">
            {submitLabel}
          </Button>
        </div>
      )}
    </ActionForm>
  );
}

/** Roles in the order people think of them: up the bunk ladder, then the rest. */
const FORM_ORDER: StaffRole[] = ["counselor", "head_counselor", "division_head", "director", "scanner", "office", "logistics", "owner"];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 py-5 first:pt-0 md:grid-cols-[8rem_1fr] md:gap-6">
      <h3 className="text-sm font-semibold md:pt-1.5">{label}</h3>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
