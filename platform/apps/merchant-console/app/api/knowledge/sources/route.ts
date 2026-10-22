import { NextResponse } from "next/server";
import { ingestKnowledgeVersion, KnowledgeIntakeError } from "@platform/composition/knowledge-intake.js";
import type { KnowledgeSourceKind } from "@platform/contracts/data/knowledge.js";
import { HttpError, assertKnownFields, assertSameOrigin, parseBoundedFormData, routeErrorResponse } from "@/lib/http.js";
import { requireKnowledgeHost, versionSummary } from "@/lib/host.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { repository, intakeAudit, identity } = await requireKnowledgeHost();
    const sources = await repository.listSources(identity.workspace);
    const data = [];
    for (const source of sources) {
      const versions = await repository.listVersions(identity.workspace, source.sourceId);
      data.push({
        source: { sourceId: source.sourceId, title: source.title, kind: source.kind, status: source.status, createdAt: source.createdAt },
        versions: versions.map(versionSummary),
      });
    }
    const quarantine = await intakeAudit.listQuarantine(identity.workspace);
    return NextResponse.json({ data, quarantine: quarantine.map((record) => ({
      attemptId: record.attemptId,
      kind: record.kind,
      title: record.title,
      filename: record.filename,
      byteSize: record.byteSize,
      failureCode: record.failureCode,
      createdAt: record.createdAt,
    })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { repository, extractor, storage, intakeAudit, identity } = await requireKnowledgeHost();
    const form = await parseBoundedFormData(request, 5 * 1024 * 1024 + 256 * 1024);
    assertKnownFields(form, ["kind", "title", "content", "file"]);

    const kindValue = form.get("kind");
    const title = form.get("title");
    if (typeof kindValue !== "string" || !["faq", "pdf", "csv"].includes(kindValue)
      || typeof title !== "string") throw new HttpError(400, "INVALID_KNOWLEDGE_INPUT");
    const kind = kindValue as KnowledgeSourceKind;
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    let version;
    if (kind === "faq") {
      const content = form.get("content");
      const file = form.get("file");
      if (typeof content !== "string" || (file instanceof File && file.name.length > 0)) throw new HttpError(400, "INVALID_KNOWLEDGE_INPUT");
      version = await ingestKnowledgeVersion({ repository, extractor, storage, intakeAudit }, {
        workspace: identity.workspace,
        userId: identity.userId,
        idempotencyKey,
        title,
        kind,
        content,
      });
    } else {
      const file = form.get("file");
      const content = form.get("content");
      if (!(file instanceof File) || file.name.length === 0 || (typeof content === "string" && content.length > 0)) {
        throw new HttpError(400, "INVALID_KNOWLEDGE_INPUT");
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      version = await ingestKnowledgeVersion({ repository, extractor, storage, intakeAudit }, {
        workspace: identity.workspace,
        userId: identity.userId,
        idempotencyKey,
        title,
        kind,
        bytes,
        filename: file.name,
        contentType: file.type,
      });
    }
    return NextResponse.json({ data: versionSummary(version) }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    if (error instanceof KnowledgeIntakeError) {
      return NextResponse.json({ error: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    return routeErrorResponse(error);
  }
}
