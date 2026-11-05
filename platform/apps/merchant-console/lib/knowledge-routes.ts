import { ingestKnowledgeVersion } from "../../../composition/knowledge-intake.js";
import type { KnowledgeIntakeAuditPort } from "../../../contracts/data/knowledge-intake.js";
import type { KnowledgeObjectStoragePort } from "../../../contracts/data/knowledge-storage.js";
import type {
  KnowledgeApprovalPort,
  KnowledgeDocumentExtractorPort,
  KnowledgeRepositoryPort,
  KnowledgeSourceKind,
  KnowledgeVersion,
} from "../../../contracts/data/knowledge.js";
import { areKnowledgeCitationsCurrent, retrieveKnowledge } from "../../../modules/knowledge/index.js";
import type { MerchantIdentity } from "../../../modules/tenancy/merchant-identity.js";
import { HttpError, assertKnownFields, assertSameOrigin, assertSameOriginRead, parseBoundedFormData, readBoundedJson, routeErrorResponse } from "./http.js";
import { createRateLimiter, type RateLimit } from "./rate-limit.js";

export type KnowledgeHostContext = Readonly<{
  identity: MerchantIdentity;
  repository: KnowledgeRepositoryPort;
  intakeAudit: KnowledgeIntakeAuditPort;
  extractor: KnowledgeDocumentExtractorPort;
  storage: KnowledgeObjectStoragePort;
  approval: KnowledgeApprovalPort;
  revocation: import("../../../adapters/persistence/supabase/knowledge-revocation.js").KnowledgeRevocationPort;
}>;

export type KnowledgeRouteLimits = Readonly<{ upload?: RateLimit; search?: RateLimit }>;

const noStore = { "Cache-Control": "no-store" };

function versionSummary(version: Pick<KnowledgeVersion, "sourceId" | "versionId" | "kind" | "title" | "status" | "createdAt" | "approvedAt" | "chunks" | "visibility">) {
  return Object.freeze({
    sourceId: version.sourceId,
    versionId: version.versionId,
    kind: version.kind,
    title: version.title,
    status: version.status,
    createdAt: version.createdAt,
    approvedAt: version.approvedAt,
    chunkCount: version.chunks.length,
    visibility: version.visibility,
  });
}

/** Framework-free route logic; route.ts files only bind it to the real host provider so tests can run it. */
export function createKnowledgeRoutes(requireHost: () => Promise<KnowledgeHostContext>, limits: KnowledgeRouteLimits = {}) {
  const uploadLimiter = createRateLimiter(limits.upload ?? { limit: 20, windowMs: 60_000 });
  const searchLimiter = createRateLimiter(limits.search ?? { limit: 60, windowMs: 60_000 });
  const enforce = (limiter: ReturnType<typeof createRateLimiter>, userId: string) => {
    const retryAfter = limiter.retryAfterSeconds(userId);
    if (retryAfter > 0) throw new HttpError(429, "RATE_LIMITED", retryAfter);
  };

  return Object.freeze({
    async listSources(request: Request): Promise<Response> {
      try {
        assertSameOriginRead(request);
        const { repository, intakeAudit, identity } = await requireHost();
        const data = (await repository.listSourceSummaries(identity.workspace)).map(({ source, versions }) => ({
          source: { sourceId: source.sourceId, title: source.title, kind: source.kind, status: source.status, createdAt: source.createdAt },
          versions,
        }));
        const quarantine = await intakeAudit.listQuarantine(identity.workspace);
        return Response.json({ data, quarantine: quarantine.map((record) => ({
          attemptId: record.attemptId,
          kind: record.kind,
          title: record.title,
          filename: record.filename,
          byteSize: record.byteSize,
          failureCode: record.failureCode,
          createdAt: record.createdAt,
        })) }, { headers: noStore });
      } catch (error: unknown) {
        return routeErrorResponse(error);
      }
    },

    async createSource(request: Request): Promise<Response> {
      try {
        assertSameOrigin(request);
        const { repository, extractor, storage, intakeAudit, identity } = await requireHost();
        enforce(uploadLimiter, identity.userId);
        const form = await parseBoundedFormData(request, 5 * 1024 * 1024 + 256 * 1024);
        assertKnownFields(form, ["kind", "title", "content", "file", "visibility"]);

        const rawVisibility = form.get("visibility");
        let visibility: "internal" | "customer" | undefined;
        if (rawVisibility !== null) {
          if (rawVisibility === "internal" || rawVisibility === "customer") {
            visibility = rawVisibility;
          } else {
            throw new HttpError(400, "INVALID_KNOWLEDGE_INPUT");
          }
        }

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
            ...(visibility !== undefined ? { visibility } : {}),
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
            ...(visibility !== undefined ? { visibility } : {}),
          });
        }
        return Response.json({ data: versionSummary(version) }, { status: 201, headers: noStore });
      } catch (error: unknown) {
        return routeErrorResponse(error);
      }
    },

    async approveVersion(request: Request, context: { params: Promise<{ sourceId: string; versionId: string }> }): Promise<Response> {
      try {
        assertSameOrigin(request);
        const { repository, approval, identity } = await requireHost();
        if (identity.role !== "owner") throw new HttpError(403, "OWNER_ROLE_REQUIRED");
        const { sourceId, versionId } = await context.params;
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(sourceId)
          || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(versionId)) throw new HttpError(404, "VERSION_NOT_FOUND");
        await approval.approve(identity.workspace, sourceId, versionId);
        // The approval has committed; a failed read-back must not turn it into an error the client would retry.
        let version: Awaited<ReturnType<typeof repository.getVersion>> = null;
        try {
          version = await repository.getVersion(identity.workspace, sourceId, versionId);
        } catch {
          // fall through to the minimal answer below
        }
        if (!version) return Response.json({ data: { sourceId, versionId, status: "approved" } }, { headers: noStore });
        return Response.json({ data: versionSummary(version) }, { headers: noStore });
      } catch (error: unknown) {
        return routeErrorResponse(error);
      }
    },

    async revokeVersion(request: Request, context: { params: Promise<{ sourceId: string; versionId: string }> }): Promise<Response> {
      try {
        assertSameOrigin(request);
        const { repository, revocation, identity } = await requireHost();
        if (identity.role !== "owner") throw new HttpError(403, "OWNER_ROLE_REQUIRED");
        const { sourceId, versionId } = await context.params;
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(sourceId)
          || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(versionId)) throw new HttpError(404, "VERSION_NOT_FOUND");
        const body = await readBoundedJson(request, 4_096);
        if (typeof body !== "object" || body === null || Array.isArray(body)
          || Object.keys(body).length !== 1 || !("reason" in body) || typeof body.reason !== "string"
          || body.reason.trim().length < 1 || body.reason.trim().length > 500) {
          throw new HttpError(400, "INVALID_KNOWLEDGE_INPUT");
        }
        await revocation.revokeVersion(identity.workspace, sourceId, versionId, body.reason.trim());
        // Revocation has committed; a failed read-back must not turn it into a retryable error.
        let version: Awaited<ReturnType<typeof repository.getVersion>> = null;
        try {
          version = await repository.getVersion(identity.workspace, sourceId, versionId);
        } catch {
          // fall through to the minimal answer below
        }
        if (!version) return Response.json({ data: { sourceId, versionId, status: "revoked" } }, { headers: noStore });
        return Response.json({ data: versionSummary(version) }, { headers: noStore });
      } catch (error: unknown) {
        return routeErrorResponse(error);
      }
    },

    async getVersion(request: Request, context: { params: Promise<{ sourceId: string; versionId: string }> }): Promise<Response> {
      try {
        assertSameOriginRead(request);
        const { repository, identity } = await requireHost();
        if (identity.role !== "owner") throw new HttpError(403, "OWNER_ROLE_REQUIRED");
        const { sourceId, versionId } = await context.params;
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(sourceId)
          || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(versionId)) throw new HttpError(404, "VERSION_NOT_FOUND");
        const version = await repository.getVersion(identity.workspace, sourceId, versionId);
        if (!version) throw new HttpError(404, "VERSION_NOT_FOUND");
        const content = version.content.slice(0, 20_000);
        return Response.json({ data: { ...versionSummary(version), content, truncated: version.content.length > content.length } }, { headers: noStore });
      } catch (error: unknown) {
        return routeErrorResponse(error);
      }
    },

    async search(request: Request): Promise<Response> {
      try {
        assertSameOrigin(request);
        const { identity, repository } = await requireHost();
        enforce(searchLimiter, identity.userId);
        const body = await readBoundedJson(request, 4_096);
        if (typeof body !== "object" || body === null || Array.isArray(body)
          || Object.keys(body).length !== 1 || !("query" in body) || typeof body.query !== "string") {
          throw new HttpError(400, "INVALID_RETRIEVAL_QUERY");
        }
        const result = await retrieveKnowledge(repository, {
          workspace: identity.workspace, query: body.query, limit: 5, audience: "staff",
        });
        if (result.kind !== "evidence") return Response.json({ data: result }, { headers: noStore });
        const current = await areKnowledgeCitationsCurrent(repository, identity.workspace, result.hits.map((hit) => hit.citation), "staff");
        if (!current) throw new Error("CITATION_REVALIDATION_FAILED");
        return Response.json({ data: {
          kind: "evidence",
          hits: result.hits.map((hit) => ({
            title: hit.title,
            excerpt: hit.text,
            score: hit.score,
            citation: hit.citation,
          })),
        } }, { headers: noStore });
      } catch (error: unknown) {
        return routeErrorResponse(error);
      }
    },
  });
}
