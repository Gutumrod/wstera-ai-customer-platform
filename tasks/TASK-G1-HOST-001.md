# Proposed Task — G1 authenticated knowledge host

**Status: PROPOSED; Owner must approve this scope and the host/auth/storage choices before implementation.** This is the next implementation slice toward G1, not a claim that the one-shop Web MVP is complete.

## Goal

Let an authenticated staff member in one controlled workspace upload, validate, review, and approve FAQ/PDF/CSV knowledge through a server-owned identity boundary. Persist the approved version and source-addressable page/row/span citations using the existing knowledge module and PostgreSQL adapter. Keep this host provider-neutral outside replaceable auth/storage/database adapters.

## Recommended starting architecture (not locked)

- Run upload and PDF extraction on a Node.js runtime because `LocalKnowledgeDocumentExtractor` uses `node:worker_threads` and PDF.js package assets. Cloudflare Workers currently exposes `node:worker_threads` only as a non-functional stub. A runtime-neutral extractor or separate Node ingestion service is an alternative, but adds implementation scope.
- Use the proposed Next.js/TypeScript host and Supabase Auth, PostgreSQL and private Storage only after Owner approval. Pin exact dependencies and follow current official documentation during implementation; do not add service credentials to browser code.
- For serverless PostgreSQL, validate the selected driver with the Supabase transaction pooler, disable prepared statements if required, and keep workspace `SET LOCAL` within the adapter transaction. Connect with a runtime role that is not superuser and has no `BYPASSRLS`.
- Do not select a model provider, call a live model, apply hosted migrations, deploy, or incur paid resource use in this task.

## Scope

1. Define the minimum workspace membership and connection-ownership schema needed to resolve the one controlled shop from authenticated server identity. Browser input and user-editable metadata must never select the workspace.
2. Compose server-side auth, trusted workspace resolution, `PostgresKnowledgeRepository`, `KnowledgeDocumentExtractorPort`, and a private object-storage adapter through `platform/composition/`.
3. Add authenticated routes for source creation, bounded upload, extraction/indexing, review and approval. Store originals under immutable workspace/source/version paths; define rollback/cleanup behavior when storage and database operations fail independently.
4. Add a minimal merchant-console flow to upload and review sources. Do not build self-service onboarding, subscriptions, or a LINE setup flow.
5. Document required secrets and local setup in `.env.example` and the task report. Keep secrets server-only and fail closed when configuration is missing.

## Acceptance criteria

- Unauthenticated requests, non-member staff, forged workspace selectors, cross-workspace source IDs and cross-workspace storage paths are denied at the host/API and persistence/storage boundaries.
- Approved knowledge versions are immutable and retrieval exposes only current approved chunks with exact source/version/page/row/span identity.
- FAQ, PDF and CSV uploads enforce byte/type/extraction bounds, quarantine malformed or unsupported files, and preserve exact citations. Parser timeout and storage/database failures never produce false success.
- Repeating the same upload/approval request is idempotent; conflicting content or approval races fail closed. Cleanup does not delete another workspace's objects.
- No browser bundle contains database credentials, storage service keys or model keys. No `platform/modules/` code imports framework, Supabase or other vendor SDKs.
- Automated tests cover membership/tenant crossover, upload limits and malformed input, retries, concurrent approval, storage failure, database failure and revoked-source retrieval denial.
- A local end-to-end test proves authenticated upload → approved version → retrievable citation. It does not substitute for the later browser-to-human G1 acceptance trace.
- `npm ci && npm run check`, dependency audit and `git diff --check` pass; independent security review has no actionable findings.

## Explicitly deferred to following G1 tasks

- Public Web Chat session/origin binding and visitor UI through the shared `SupportOrchestrator`.
- Durable conversation repository, staff Inbox, human authorization and atomic send/outbox guard.
- Live model/provider selection, durable usage/spend ceiling and measured generated-answer grounding.
- Browser E2E demonstration of upload → cited answer → durable human takeover and authorized resume.
- LINE integration, multi-shop self-service, billing and deployment.

## Owner decisions required before implementation

- Approve Node.js host runtime or choose the Cloudflare route with a separately validated extractor design.
- Approve the proposed Next.js + Supabase Auth/Postgres/Storage direction, or name a replacement.
- Specify controlled-shop bootstrap/initial staff identity, data region, retention/deletion policy and maximum source upload constraints.
- Keep live model/provider spend and all hosted deployment/migration outside this task unless separately approved.
