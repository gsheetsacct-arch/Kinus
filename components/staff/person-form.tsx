"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ActionForm } from "@/components/action-form";
import { cn } from "@/lib/utils";
import { STAFF_ROLES } from "@/lib/labels";
import type { AccessLevel, StaffRole } from "@/lib/auth/permissions";
import type { AreaTree } from "@/lib/data/areas";
import type { ActionResult } from "@/lib/actions/result";
import { AreaPicker } from "./area-picker";

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
        <Field label="Position (optional)" htmlFor="title" hint="What they do at camp, e.g. Learning head, Waterfront, Night watch. Shown in the phone book." className="sm:col-span-3">
          <Input id="title" name="title" defaultValue={person.title} maxLength={80} dir="auto" disabled={readOnly} />
        </Field>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">1 · Role</h3>
        <p className="text-xs text-muted-foreground">The role decides what they can do and which details they see. Directors over all of camp set that per role under Roles.</p>
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
                onChange={() => setRole(r)}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span>
                <span className="block font-medium">{STAFF_ROLES[r].label}</span>
                <span className="block text-xs text-muted-foreground">{STAFF_ROLES[r].description}</span>
                {summaries[r] && <span className="mt-1 block text-xs font-medium text-foreground/80">{summaries[r]}</span>}
              </span>
            </label>
          ))}
        </div>
      </section>

      {role !== "owner" && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">2 · Where</h3>
          <p className="text-xs text-muted-foreground">Which campers they work with.</p>
          <div className={cn(readOnly && "pointer-events-none opacity-70")}>
            <AreaPicker tree={tree} defaultAll={person.all_areas} defaultAreas={person.areas} lockAll={lockAll} />
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
