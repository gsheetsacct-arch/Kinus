import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Welcome, {user.fullName}</CardTitle>
          <CardDescription>Choose a password for {user.email}. You can also keep signing in with emailed links.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={setPassword} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm">Repeat password</Label>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            <Button type="submit" className="w-full" size="lg">
              Save password
            </Button>
          </ActionForm>
        </CardContent>
      </Card>
    </main>
  );
}
