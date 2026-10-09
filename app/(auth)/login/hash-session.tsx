"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Completes sign-in from emailed links. Invitations and sign-in links carry the session
 * in the URL #fragment (implicit flow); the browser client stores it in cookies for the
 * server. Also forwards people who are already signed in.
 */
export function HashSession({ next, signedIn }: { next: string; signedIn: boolean }) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const errorDescription = params.get("error_description");
    if (errorDescription) {
      setState("error");
      setMessage(
        /expired|invalid/i.test(errorDescription) ? "That link has expired or was already used. Request a new one below." : errorDescription.replace(/\+/g, " "),
      );
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) {
      if (signedIn) window.location.replace(next);
      return;
    }
    const type = params.get("type");
    setState("working");
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          setState("error");
          setMessage(error.message);
          return;
        }
        // A full page load (not a client-side navigation) so the server reads the new
        // session cookie; it also drops the tokens from the address bar and history.
        window.location.replace(type === "invite" || type === "recovery" || type === "signup" ? "/set-password" : next);
      })
      .catch((e: Error) => {
        setState("error");
        setMessage(e.message);
      });
  }, [next, signedIn]);

  if (state === "working" || (signedIn && state === "idle")) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background text-sm text-muted-foreground">Signing you in…</div>;
  }
  if (state === "error") return <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>;
  return null;
}
