"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (process.env.NEXT_PUBLIC_APP_ENV !== "local" || !url || !publishableKey) throw new Error("LOCAL_SUPABASE_PUBLIC_ENVIRONMENT_REQUIRED");
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || parsed.port !== "54321") {
    throw new Error("LOCAL_SUPABASE_URL_REQUIRED");
  }
  return createBrowserClient(url, publishableKey);
}
