import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Local prototype admin client; never import from a client component. */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (process.env.APP_ENV !== "local" || !url || !secretKey) throw new Error("LOCAL_SUPABASE_SERVER_SECRET_REQUIRED");
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || parsed.port !== "54321") {
    throw new Error("LOCAL_SUPABASE_URL_REQUIRED");
  }
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
