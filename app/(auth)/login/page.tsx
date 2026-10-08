import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/action-form";
import { sendMagicLink, signInWithPassword } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Kinus</CardTitle>
          <CardDescription>Staff sign-in</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{decodeURIComponent(error)}</p>}
          <ActionForm action={signInWithPassword} className="space-y-3">
            <input type="hidden" name="next" value={next ?? "/"} />
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full" size="lg">
              Sign in
            </Button>
          </ActionForm>
          <div className="relative text-center text-xs text-muted-foreground">
            <span className="bg-card px-2">or</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" />
          </div>
          <ActionForm action={sendMagicLink} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email2">Email me a sign-in link</Label>
              <Input id="email2" name="email" type="email" autoComplete="email" required />
            </div>
            <Button type="submit" variant="outline" className="w-full">
              Send link
            </Button>
          </ActionForm>
        </CardContent>
      </Card>
    </main>
  );
}
