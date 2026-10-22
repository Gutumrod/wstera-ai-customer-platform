import { NextResponse } from "next/server";
import { retrieveKnowledge, areKnowledgeCitationsCurrent } from "@platform/modules/knowledge/index.js";
import { HttpError, assertSameOrigin, readBoundedJson, routeErrorResponse } from "@/lib/http.js";
import { requireKnowledgeHost } from "@/lib/host.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { identity, repository } = await requireKnowledgeHost();
    const body = await readBoundedJson(request, 4_096);
    if (typeof body !== "object" || body === null || Array.isArray(body)
      || Object.keys(body).length !== 1 || !("query" in body) || typeof body.query !== "string") {
      throw new HttpError(400, "INVALID_RETRIEVAL_QUERY");
    }
    const result = await retrieveKnowledge(repository, { workspace: identity.workspace, query: body.query, limit: 5 });
    if (result.kind !== "evidence") return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
    const current = await areKnowledgeCitationsCurrent(repository, identity.workspace, result.hits.map((hit) => hit.citation));
    if (!current) throw new Error("CITATION_REVALIDATION_FAILED");
    return NextResponse.json({ data: {
      kind: "evidence",
      hits: result.hits.map((hit) => ({
        title: hit.title,
        excerpt: hit.text,
        score: hit.score,
        citation: hit.citation,
      })),
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return routeErrorResponse(error);
  }
}
