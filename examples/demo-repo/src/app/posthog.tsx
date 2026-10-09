"use client";
import posthog from "posthog-js";
import { useEffect, type ReactNode } from "react";

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, { api_host: "https://eu.i.posthog.com" });
  }, []);
  return <>{children}</>;
}
