"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/action-form";
import { sendMagicLink, signInWithPassword } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  return (
    <div className="space-y-4">
      {mode === "password" ? (
        <ActionForm action={signInWithPassword} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-12" />
          </div>
          <Button type="submit" className="w-full" size="lg">
            Sign in
          </Button>
        </ActionForm>
      ) : (
        <ActionForm action={sendMagicLink} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
            <p className="text-xs text-muted-foreground">We&apos;ll email you a link that signs you in. No password needed.</p>
          </div>
          <Button type="submit" className="w-full" size="lg">
            Email me a sign-in link
          </Button>
        </ActionForm>
      )}
      <button type="button" onClick={() => setMode(mode === "password" ? "link" : "password")} className="w-full text-center text-sm text-primary hover:underline">
        {mode === "password" ? "Forgot your password? Email me a sign-in link" : "Sign in with a password instead"}
      </button>
    </div>
  );
}
