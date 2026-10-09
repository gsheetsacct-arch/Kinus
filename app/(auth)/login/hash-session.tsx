"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Invitations and magic links sent from the Supabase dashboard land on the Site URL
 * with the session in the URL hash (implicit flow). The browser client picks it up,
 * stores it in cookies, and we continue to the right page.
 */
export function HashSession() {
  const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;
    const type = new URLSearchParams(hash.slice(1)).get("type");
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) return;
      subscription.unsubscribe();
      router.replace(type === "invite" || type === "recovery" ? "/set-password" : "/");
    });
    return () => subscription.unsubscribe();
  }, [router]);
  return null;
}
