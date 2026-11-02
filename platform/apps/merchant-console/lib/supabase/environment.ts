const loopbackHosts = ["127.0.0.1", "localhost", "[::1]"];

export type SupabaseEnvironmentInput = Readonly<{
  appEnv: string | undefined;
  publicAppEnv: string | undefined;
  url: string;
  projectRef: string | undefined;
}>;

/**
 * Returns the error code that blocks this environment, or undefined when it is accepted.
 * Pure so the browser bundle and proxy share it; callers read NEXT_PUBLIC_* by literal name because Next.js inlines them at build.
 */
export function supabaseEnvironmentProblem(input: SupabaseEnvironmentInput): string | undefined {
  if (input.appEnv === "lab") {
    if (input.publicAppEnv !== "lab") return "LAB_APP_ENV_MISMATCH";
    if (!input.projectRef || !/^[a-z0-9]{20}$/.test(input.projectRef)) return "LAB_SUPABASE_PROJECT_REF_REQUIRED";
    return input.url === `https://${input.projectRef}.supabase.co` ? undefined : "LAB_SUPABASE_URL_REQUIRED";
  }
  if (input.appEnv !== "local") return "SUPABASE_APP_ENV_UNSUPPORTED";
  let parsed: URL;
  try { parsed = new URL(input.url); } catch { return "LOCAL_SUPABASE_URL_REQUIRED"; }
  return loopbackHosts.includes(parsed.hostname) && parsed.port === "54321" ? undefined : "LOCAL_SUPABASE_URL_REQUIRED";
}
