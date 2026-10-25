import { createMerchantKnowledgeHost } from "../../../composition/merchant-knowledge-host.js";
import { requireMerchantIdentity } from "./identity.js";

export async function requireKnowledgeHost() {
  const { client, identity } = await requireMerchantIdentity();
  const host = await createMerchantKnowledgeHost();
  return { ...host, client, identity };
}

export function versionSummary(version: Readonly<{
  sourceId: string;
  versionId: string;
  kind: string;
  title: string;
  status: string;
  createdAt: string;
  approvedAt?: string;
  chunks: readonly unknown[];
}>) {
  return Object.freeze({
    sourceId: version.sourceId,
    versionId: version.versionId,
    kind: version.kind,
    title: version.title,
    status: version.status,
    createdAt: version.createdAt,
    approvedAt: version.approvedAt,
    chunkCount: version.chunks.length,
  });
}
