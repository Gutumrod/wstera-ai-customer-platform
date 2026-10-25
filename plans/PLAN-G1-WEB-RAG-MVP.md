# Proposed Execution Plan — G1 One-Shop Web/RAG MVP

**Status: PROPOSED execution plan, updated 2026-10-25 against `main` at `9b4f997`.** PRs #16 and #18–#21 are merged. The local synthetic knowledge host is implemented and merged, but G1 end-to-end acceptance remains open. Product goals remain those locked in `BRIEF.md`; this plan does not invent evaluation thresholds or authorize hosted/production work.

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

## Owner decisions locked 2026-10-25

- **Local E2E runtime (step 2):** Owner approved installing Docker Desktop + Supabase CLI on the local Windows machine so the browser-to-local-Supabase trace is real. Hosted resources, hosted migrations and provider spend remain unauthorized.
- **G1 answer path (steps 4–6):** build both an extractive cited-answer path (default, no provider call) and the model-backed path behind an off-by-default flag. G1 acceptance runs the extractive path; enabling the flag needs separate Owner approval plus a budget ceiling, usage ledger and data-region choice.
- **Work order:** harden the host boundary (step 3) → Web Chat (step 4) → durable handoff (step 5) → G1 acceptance (step 6). Do not start Web Chat before the host hardening task is merged.

## Proposed work order

1. **Reconcile status documents.** Update execution status, blockers and work queue to reflect PRs #18–#21 merged on 2026-10-25; do not inherit stale pending-merge statements.
2. **Close the local host evidence gap.** Run the documented Docker-backed synthetic Supabase sign-in → upload → review/approve → citation-search flow. The PR #18 automated checks and review do not replace this E2E trace. Docker Desktop + Supabase CLI were approved for this machine on 2026-10-25; if the stack cannot run after install, stop and report rather than substituting mocks.
3. **Harden the host boundary.** Add route-level tests and rate limiting, resolve the documented membership-revalidation race, then obtain independent security review against the final candidate.
4. **Build the Web Chat vertical slice.** Add origin/session binding and visitor UI on the shared support engine; return approved-source citations and fail closed on unknown, conflicting or insufficient evidence. Ship the extractive cited-answer path as the default and keep the model-backed path behind an off-by-default flag. No live model/provider call without separate Owner approval and budget.
5. **Make human takeover durable.** Add persistent staff authorization, pause/resume state and send-time compare-and-send/outbox enforcement; test retries, provider failures and tenant crossover.
6. **Run G1 acceptance.** Capture one reproducible browser trace from authenticated knowledge upload through cited visitor answer (extractive path, model flag off) and authorized staff takeover/resume, plus negative cross-workspace cases. Record current tests, review, limitations and observed measurements; ask Owner to review the evidence.
7. **Open G2 only after G1 acceptance.** Scope LINE sandbox round-trip and human handoff separately. Keep the merged PromptPay builder and business-action lifecycle as isolated foundations; P3A executor and P4 PromptPay wiring remain planned tasks, not part of this G1 slice.

The current checkout may be behind `main`; start any follow-up from the latest `main` and follow the project-local branch/worktree rule in `AGENTS.md`. Do not merge or deploy without Owner review.

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
