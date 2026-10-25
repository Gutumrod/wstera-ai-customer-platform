export function requiredKnowledgeDatabaseUrl(appEnv = process.env.APP_ENV, value = process.env.DATABASE_URL): string {
  if (appEnv === "lab") {
    if (!value) throw new Error("LAB_DATABASE_URL_REQUIRED");
    let parsed: URL;
    try { parsed = new URL(value); } catch { throw new Error("LAB_KNOWLEDGE_DATABASE_URL_REQUIRED"); }
    const username = decodeURIComponent(parsed.username);
    const validRole = /^(knowledge_runtime|postgres)\.[a-z0-9]{20}$/.test(username);
    if (!/^postgres(?:ql)?:$/.test(parsed.protocol) || !parsed.hostname.endsWith(".pooler.supabase.com")
      || !["5432", "6543"].includes(parsed.port) || parsed.pathname !== "/postgres"
      || parsed.password.length === 0 || !validRole) {
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
