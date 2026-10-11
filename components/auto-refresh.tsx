"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Reloads the page's data every few seconds while something is still being prepared. */
export function AutoRefresh({ every = 3000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    // only while someone is looking (a phone in a pocket doesn't need fresh numbers)
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
