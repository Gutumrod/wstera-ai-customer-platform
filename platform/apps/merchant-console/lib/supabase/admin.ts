import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnvironmentProblem } from "./environment.js";

/** Admin client for the local and lab hosts; never import from a client component. */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error("SUPABASE_SERVER_SECRET_REQUIRED");
  const problem = supabaseEnvironmentProblem({
    appEnv: process.env.APP_ENV,
    publicAppEnv: process.env.NEXT_PUBLIC_APP_ENV,
    url,
    projectRef: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
  });
  if (problem) throw new Error(problem);
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
