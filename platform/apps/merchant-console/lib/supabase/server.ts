import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnvironmentProblem } from "./environment.js";

function supabaseEnvironment(): Readonly<{ url: string; publishableKey: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("SUPABASE_PUBLIC_ENVIRONMENT_REQUIRED");
  const problem = supabaseEnvironmentProblem({
    appEnv: process.env.APP_ENV,
    publicAppEnv: process.env.NEXT_PUBLIC_APP_ENV,
    url,
    projectRef: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
  });
  if (problem) throw new Error(problem);
  return { url, publishableKey };
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseEnvironment();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot mutate cookies; proxy.ts performs refresh writes.
        }
      },
    },
  });
}
