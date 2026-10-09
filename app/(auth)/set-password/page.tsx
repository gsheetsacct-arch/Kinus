import { Tent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/action-form";
import { requireUser } from "@/lib/auth/current-user";
import { setPassword } from "../actions";

export const metadata = { title: "Set password" };

export default async function SetPasswordPage() {
  const user = await requireUser();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-[var(--shadow-card)]">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Tent className="size-5" />
          </span>
          <span className="text-lg font-semibold">Kinus</span>
        </div>
        <h1 className="text-2xl font-semibold">Welcome, {user.fullName.split(" ")[0]}</h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">Choose a password for {user.email}. You can always use an emailed link instead.</p>
        <ActionForm action={setPassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Repeat password</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="h-12" />
          </div>
          <Button type="submit" className="w-full" size="lg">
            Save and continue
          </Button>
        </ActionForm>
      </div>
    </main>
  );
}
