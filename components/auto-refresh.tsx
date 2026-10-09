"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Reloads the page's data every few seconds while something is still being prepared. */
export function AutoRefresh({ every = 3000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
