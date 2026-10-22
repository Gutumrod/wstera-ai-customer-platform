import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function supabaseEnvironment(): Readonly<{ url: string; publishableKey: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (process.env.APP_ENV !== "local" || !url || !publishableKey) throw new Error("LOCAL_SUPABASE_PUBLIC_ENVIRONMENT_REQUIRED");
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || parsed.port !== "54321") {
    throw new Error("LOCAL_SUPABASE_URL_REQUIRED");
  }
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
