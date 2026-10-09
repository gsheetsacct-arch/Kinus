"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ActionForm } from "@/components/action-form";
import { cn } from "@/lib/utils";
import { ACCESS_LEVELS, STAFF_ROLES } from "@/lib/labels";
import type { AccessLevel, StaffRole } from "@/lib/auth/permissions";
import type { AreaTree } from "@/lib/data/areas";
import type { ActionResult } from "@/lib/actions/result";
import { AreaPicker } from "./area-picker";

export type PersonFormValues = {
  id?: string;
  full_name: string;
  email: string;
  phone: string;
  role: StaffRole;
  access_level: AccessLevel;
  all_areas: boolean;
  areas: string[];
};

/** One form for everything about a person: who they are, their role, where, and what they can do. */
export function PersonForm({
  person,
  roles,
  tree,
  action,
  submitLabel,
  lockAll,
  readOnly,
  isNew,
}: {
  person: PersonFormValues;
  roles: StaffRole[];
  tree: AreaTree;
  action: (fd: FormData) => Promise<ActionResult>;
  submitLabel: string;
  lockAll?: boolean;
  readOnly?: boolean;
  isNew?: boolean;
}) {
  const [role, setRole] = React.useState<StaffRole>(person.role);
  const [level, setLevel] = React.useState<AccessLevel>(person.access_level);
  return (
    <ActionForm action={action} className="space-y-8">
      {person.id && <input type="hidden" name="id" value={person.id} />}
      <section className="grid gap-4 sm:grid-cols-3">
        <Field label="Full name" htmlFor="full_name">
          <Input id="full_name" name="full_name" defaultValue={person.full_name} required dir="auto" disabled={readOnly} />
        </Field>
        <Field label="Email" htmlFor="email" hint={isNew ? "Their invitation goes here." : undefined}>
          <Input id="email" name="email" type="email" defaultValue={person.email} required disabled={!isNew || readOnly} />
        </Field>
        <Field label="Phone (optional)" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={person.phone} disabled={readOnly} />
        </Field>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">1 · Role</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <label
              key={r}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-sm hover:bg-muted/40",
                role === r && "border-primary bg-primary-soft/50 ring-1 ring-primary",
                readOnly && "pointer-events-none opacity-70",
              )}
            >
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => {
                  setRole(r);
                  setLevel(STAFF_ROLES[r].defaultLevel);
                }}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span>
                <span className="block font-medium">{STAFF_ROLES[r].label}</span>
                <span className="block text-xs text-muted-foreground">{STAFF_ROLES[r].description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {role !== "owner" && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">2 · Where</h3>
          <div className={cn(readOnly && "pointer-events-none opacity-70")}>
            <AreaPicker tree={tree} defaultAll={person.all_areas} defaultAreas={person.areas} lockAll={lockAll} />
          </div>
        </section>
      )}

      {role !== "owner" && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">3 · What they can do there</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(ACCESS_LEVELS) as AccessLevel[]).map((l) => (
              <label
                key={l}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-sm",
                  level === l && "border-primary bg-primary-soft/50 ring-1 ring-primary",
                  readOnly && "pointer-events-none opacity-70",
                )}
              >
                <input type="radio" name="access_level" value={l} checked={level === l} onChange={() => setLevel(l)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                <span>
                  <span className="block font-medium">
                    {ACCESS_LEVELS[l].label}
                    {STAFF_ROLES[role].defaultLevel === l && <span className="ml-1 text-xs font-normal text-muted-foreground">(usual)</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">{ACCESS_LEVELS[l].description}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {isNew && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="invite" defaultChecked className="mt-0.5 size-4" />
          <span>
            Email them an invitation now
            <span className="block text-xs text-muted-foreground">They click the link, choose a password, and they&apos;re in.</span>
          </span>
        </label>
      )}
      {!readOnly && (
        <Button type="submit" size="lg">
          {submitLabel}
        </Button>
      )}
    </ActionForm>
  );
}
