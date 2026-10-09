"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Invitations, magic links and recovery links sent from the Supabase dashboard land
 * on the Site URL with the session in the URL hash (implicit flow). The SSR browser
 * client is PKCE-only and ignores that hash, so we read it ourselves and set the
 * session explicitly, which stores it in cookies for the server.
 */
export function HashSession() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const params = new URLSearchParams(hash.slice(1));
    const errorDescription = params.get("error_description");
    if (errorDescription) {
      setState("error");
      setMessage(errorDescription.replace(/\+/g, " "));
      return;
    }
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;
    const type = params.get("type");
    setState("working");
    const supabase = createClient();
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          setState("error");
          setMessage(error.message);
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
        router.replace(type === "invite" || type === "recovery" || type === "signup" ? "/set-password" : "/");
        router.refresh();
      })
      .catch((e: Error) => {
        setState("error");
        setMessage(e.message);
      });
  }, [router]);

  if (state === "working") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 text-sm text-muted-foreground">
        Signing you in…
      </div>
    );
  }
  if (state === "error") {
    return <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">That link did not work: {message}. Ask an admin to send a new one.</p>;
  }
  return null;
}
