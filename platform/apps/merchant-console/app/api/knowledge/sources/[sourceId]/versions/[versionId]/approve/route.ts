import { NextResponse } from "next/server";
import { HttpError, assertSameOrigin, routeErrorResponse } from "@/lib/http.js";
import { requireKnowledgeHost, versionSummary } from "@/lib/host.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ sourceId: string; versionId: string }> }) {
  try {
    assertSameOrigin(request);
    const { repository, identity } = await requireKnowledgeHost();
    if (identity.role !== "owner") throw new HttpError(403, "OWNER_ROLE_REQUIRED");
    const { sourceId, versionId } = await context.params;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(sourceId)
      || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(versionId)) throw new HttpError(404, "VERSION_NOT_FOUND");
    const version = await repository.approveVersion(identity.workspace, sourceId, versionId, { approvedBy: identity.userId });
    return NextResponse.json({ data: versionSummary(version) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return routeErrorResponse(error);
  }
}
