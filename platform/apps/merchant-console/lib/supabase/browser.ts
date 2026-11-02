"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnvironmentProblem } from "./environment.js";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("SUPABASE_PUBLIC_ENVIRONMENT_REQUIRED");
  const problem = supabaseEnvironmentProblem({
    appEnv: process.env.NEXT_PUBLIC_APP_ENV,
    publicAppEnv: process.env.NEXT_PUBLIC_APP_ENV,
    url,
    projectRef: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
  });
  if (problem) throw new Error(problem);
  return createBrowserClient(url, publishableKey);
}
