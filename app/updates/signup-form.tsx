"use client";
import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { signUpForUpdates, type SignUpState } from "./actions";

export function SignupForm({ consent }: { consent: string }) {
  const [state, action, pending] = React.useActionState<SignUpState, FormData>(signUpForUpdates, null);
  // kept as typed when something needs fixing (a sent form is cleared otherwise)
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [terms, setTerms] = React.useState(false);
  if (state?.ok)
    return (
      <div className="flex items-start gap-3 rounded-lg bg-primary-soft/50 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
        <p>{state.message}</p>
      </div>
    );
  return (
    <form action={action} className="space-y-4">
      <Field label="Full name" htmlFor="name">
        <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={100} className="h-12 text-base" />
      </Field>
      <Field label="Mobile phone number" htmlFor="phone">
        <Input id="phone" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" inputMode="tel" required maxLength={30} placeholder="(718) 555-0100" className="h-12 text-base" />
      </Field>
      {/* for bots only: people never see it */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
        <input type="checkbox" name="consent" value="yes" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" />
        <span>{consent}</span>
      </label>
      {/* the terms and privacy policy: a box of their own, apart from agreeing to texts */}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
        <input type="checkbox" name="terms" value="yes" checked={terms} onChange={(e) => setTerms(e.target.checked)} required className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" />
        <span>
          I have read and agree to the{" "}
          <a href="/terms" target="_blank" className="text-primary underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" className="text-primary underline">
            Privacy Policy
          </a>
          .
        </span>
      </label>
      {state && !state.ok && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.message}</p>}
      <Button type="submit" disabled={pending} className="h-12 w-full text-base">
        {pending ? "Signing up…" : "Yes, sign me up!"}
      </Button>
    </form>
  );
}
