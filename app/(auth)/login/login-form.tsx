"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/action-form";
import { sendMagicLink, sendPasswordReset, signInWithPassword } from "../actions";

type Mode = "password" | "reset" | "link";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const emailField = (
    <div className="space-y-1.5">
      <Label htmlFor="email">Email</Label>
      <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
    </div>
  );
  const switchTo = (m: Mode, label: string) => (
    <button type="button" onClick={() => setMode(m)} className="w-full text-center text-sm text-primary hover:underline">
      {label}
    </button>
  );
  return (
    <div className="space-y-4">
      {mode === "password" && (
        <ActionForm action={signInWithPassword} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          {emailField}
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-12" />
          </div>
          <Button type="submit" className="w-full" size="lg">
            Sign in
          </Button>
        </ActionForm>
      )}
      {mode === "reset" && (
        <ActionForm action={sendPasswordReset} className="space-y-4">
          {emailField}
          <p className="text-xs text-muted-foreground">We&apos;ll email you a link. Open it on any device to choose a new password.</p>
          <Button type="submit" className="w-full" size="lg">
            Email me a link to reset my password
          </Button>
        </ActionForm>
      )}
      {mode === "link" && (
        <ActionForm action={sendMagicLink} className="space-y-4">
          {emailField}
          <p className="text-xs text-muted-foreground">We&apos;ll email you a link that signs you in. No password needed.</p>
          <Button type="submit" className="w-full" size="lg">
            Email me a sign-in link
          </Button>
        </ActionForm>
      )}
      <div className="space-y-2">
        {mode !== "password" && switchTo("password", "Sign in with my password")}
        {mode !== "reset" && switchTo("reset", "Forgot your password? Reset it")}
        {mode !== "link" && switchTo("link", "Or sign in with an emailed link, no password")}
      </div>
    </div>
  );
}
