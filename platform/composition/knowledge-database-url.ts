export function requiredKnowledgeDatabaseUrl(appEnv = process.env.APP_ENV, value = process.env.DATABASE_URL): string {
  if (appEnv === "lab") {
    if (!value) throw new Error("LAB_DATABASE_URL_REQUIRED");
    let parsed: URL;
    try { parsed = new URL(value); } catch { throw new Error("LAB_KNOWLEDGE_DATABASE_URL_REQUIRED"); }
    const username = decodeURIComponent(parsed.username);
    const expectedProjectRef = process.env.SUPABASE_PROJECT_REF;
    if (!expectedProjectRef || !/^[a-z0-9]{20}$/.test(expectedProjectRef)
      || expectedProjectRef !== process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF) {
      throw new Error("LAB_SUPABASE_PROJECT_REF_REQUIRED");
    }
    if (!/^postgres(?:ql)?:$/.test(parsed.protocol) || !/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(parsed.hostname)
      || !["5432", "6543"].includes(parsed.port) || parsed.pathname !== "/postgres"
      || parsed.search !== "" || parsed.hash !== "" || parsed.password.length === 0
      || username !== `knowledge_runtime.${expectedProjectRef}`) {
      throw new Error("LAB_KNOWLEDGE_DATABASE_URL_REQUIRED");
    }
    return value;
  }
  if (appEnv !== "local" || !value) throw new Error("LOCAL_DATABASE_URL_REQUIRED");
  const parsed = new URL(value);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || parsed.port !== "54322"
    || decodeURIComponent(parsed.username) !== "knowledge_runtime") {
    throw new Error("LOCAL_KNOWLEDGE_DATABASE_URL_REQUIRED");
  }
  return value;
}

/** Lab traffic must verify the pooler certificate; the URL policy rejects query strings, so sslmode cannot be set there. */
export function knowledgeDatabaseTls(
  appEnv = process.env.APP_ENV,
  caCertificate = process.env.SUPABASE_DB_CA_CERT,
): Readonly<{ caCertificate: string }> | undefined {
  if (appEnv !== "lab") return undefined;
  if (!caCertificate?.includes("BEGIN CERTIFICATE")) throw new Error("LAB_DATABASE_CA_CERT_REQUIRED");
  return { caCertificate };
}
