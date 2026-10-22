# Proposed Execution Plan — G1 One-Shop Web/RAG MVP

**Status: PROPOSED; implementation scope and host/auth/storage choices still require Owner approval.** PR #16 has cleared the consolidation gate. Product goals remain those locked in `BRIEF.md`; this plan does not lock the proposed stack or invent evaluation thresholds.

## Problem and user

A merchant needs to maintain its own approved knowledge and give website visitors accurate Thai answers with traceable sources, while staff can take over uncertain conversations. G1 proves one controlled shop end to end and includes negative tests for another workspace.

## Scope

Included: workspace-scoped source lifecycle; FAQ/PDF/CSV synthetic fixtures; approved-source retrieval; Thai answer path and citations; uncertainty/handoff; minimal Web Chat and staff takeover; usage/error/cost observations; tenant-isolation and failure evidence.

Excluded: live LINE integration, self-service multi-shop onboarding, billing, production deployment, real customer data, paid infrastructure/provider use without approval, and business actions such as orders or payments.

## Architecture constraints already locked

- One shared provider-neutral support engine serves Web and future LINE adapters.
- Workspace authorization is server-resolved; client or model tenant values never authorize access.
- Knowledge is untrusted data. Only approved current sources can support citations; uncertainty routes to human handling.
- Provider failures fail closed. Human takeover is durable and stops automated replies until authorized staff resume.
- Modules depend on contracts; channel/model/storage/retrieval integrations stay behind ports/adapters.

## Proposed work order

1. Clear G0 review/merge and stale-document gates; accept the Phase 0C tenancy contract base.
2. Approve and execute Task 002 knowledge/retrieval contracts.
3. Build ingestion with synthetic FAQ first; add bounded PDF and CSV extraction only with explicit limits and failure handling.
4. Establish a Thai/SKU synthetic baseline before setting retrieval and citation thresholds. Include conflicts, revoked sources, no-answer and prompt-injection cases.
5. Implement one bounded shared response path through explicit model/retrieval ports. Record provider usage, latency, failures and estimated cost. No hidden mock success.
6. Add Web Chat and the smallest usable operator takeover path on the same conversation/engine contracts.
7. Run the end-to-end acceptance pass and independent security review; present evidence for Owner demo/approval.

## Acceptance criteria for G1

- A controlled workspace uploads and approves synthetic FAQ/PDF/CSV content with version, source and page/row/chunk traceability.
- A Thai query retrieves only current approved workspace content; returned citations resolve to the exact source version and span.
- Missing, conflicting, revoked or insufficient evidence returns a clear uncertainty result and a durable handoff; the AI cannot resume without authorized staff action.
- Cross-workspace negative cases fail at API/retrieval/storage boundaries; browser-supplied tenant IDs and hostile document instructions do not bypass policy.
- Provider/storage/timeouts, malformed files, duplicate requests and budget exhaustion fail safely and are observable without leaking secrets or unnecessary PII.
- A reproducible browser/E2E trace demonstrates upload → approval → question → cited answer → handoff → staff response/resume. Mocks and unit tests alone do not satisfy this criterion.
- Report test commands/results, security findings, known limitations, latency and measured/estimated cost with assumptions. An independent reviewer and Owner accept the evidence.

## Open decisions to lock before the affected task

- Authenticated merchant/staff boundary and initial workspace bootstrap method.
- Database/storage/hosting selection and data retention/deletion rules.
- PDF/CSV size, type, extraction and quarantine limits.
- Model/embedding/rerank provider, local-vs-hosted dev path, budget ceilings and data-processing region.
- Thai corpus construction, baseline metrics, and pass thresholds (set after measurement, not guessed).
- Web widget origin/session model and durable handoff operator workflow.

## Runtime compatibility evidence (2026-10-23)

- The existing `LocalKnowledgeDocumentExtractor` imports `node:worker_threads`; its PDF worker also resolves PDF.js font/CMap assets from the Node package filesystem. [Cloudflare Workers documents `node:worker_threads` as a non-functional stub](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), so the existing PDF path cannot run in a Worker as-is. The current recommendation is a Node.js runtime for the first upload/extraction host; this is not locked until Owner approval. Alternatively, the extractor would need a separate compatible execution service or a verified runtime-neutral implementation.
- [Supabase's current database guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) recommends transaction-mode pooling for serverless Postgres clients and disabling prepared statements; the repository's host adapter must keep `SET LOCAL app.workspace_id` inside its transaction and use a non-superuser, non-`BYPASSRLS` runtime role.
- [Supabase SSR auth helpers](https://supabase.com/docs/guides/auth/server-side) are currently documented as beta. Pin package versions only after the chosen framework/auth flow is approved and checked against current official docs; do not use [deprecated `@supabase/server` framework adapters](https://supabase.com/changelog/supabase-server-adapters-deprecated).

The G1 implementation remains blocked until these decisions are resolved at the task boundaries and each scoped task is approved. Avoid locking every later-stage decision up front; approve only what the next vertical slice needs.
