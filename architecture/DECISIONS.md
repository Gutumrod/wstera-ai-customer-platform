# Architecture Decisions — Proposed Baseline

Updated: 2026-10-14. Decisions are *PROPOSED* pending Owner review. Public blueprint only.

## ADR-001 — One engine, two channel products

- **Decision:** LINE OA and Web Chat use shared policy, RAG, provider, conversation and handoff contracts; only ingress/reply adapters differ.
- **Why:** Avoid duplicated storage and prompt logic; coherent tenant identity.
- **Constraint:** No channel can bypass server-side authorization.

## ADR-002 — Reuse by contracts, not code dump

- Legacy sales engine shapes `AgentBrain`, `KnowledgePort`, Tool Registry and human handoff design.
- Legacy LINE module informs signature and messaging contracts.
- Legacy resilience gateway informs provider boundary and tenant validation.
- Legacy workflow docs define backend-executed transaction policy.
- **Disposition:** implement minimal portable boundary contracts in `platform/src/`; all private legacy files stay outside public Git history.

## ADR-003 — Web Chat UI proposed stack

Next.js, assistant-ui, shadcn/ui, Vercel AI SDK; embeddable widget isolated in an iframe via lightweight loader; Cloudflare Workers-compatible API runtime. Must validate bundling, auth, iframe origin allowlist, streaming and accessibility before locking.

## ADR-004 — Storage and retrieval

Use Supabase Auth + PostgreSQL RLS + pgvector and private Storage for initial spike. Hybrid lexical+vector retrieval for Thai and SKU codes; data source versioning, approval, source citation, delete propagation. Dynamic price/stock/slots from authoritative APIs only.

## ADR-005 — Side effects and handoff

Tools are merely proposals from AI. Backend checks principal, workspace, policy, allowed action, confirmation, idempotency and source of truth; verifies before claiming completion. Handoff permanently pauses bot until authorized operator resumes.

## ADR-006 — Public/private boundary

This Public repository contains newly authored scaffold, research and small reviewed adapters. Local copies of four previously private repos are .gitignored and are NOT public dependencies. Any future upstream/vendor code import needs a signed-off provenance/licensing/security report.

## ADR-007 — Business-action contract lands ahead of its phase (Owner order 2026-10-25)

`platform/contracts/business-actions/` was marked "Phase 3+ gated". On 2026-10-25 the Owner directed this repository to absorb the reusable parts of the retired private LINE product (`D-20261025-01..02` in the house decisions register), which includes the action lifecycle.

What was allowed, and the boundary that keeps it safe:
- Only DTOs, ports and a **pure** state reducer were added. There is no executor, no payment/order/booking write, no vendor SDK and no caller.
- Risk is derived from the action kind inside `platform/modules/business-actions/`; a risk level, authorisation or confirmation coming from model text is ignored by construction.
- A record that changes business state cannot reach `executed` without confirmation; re-confirmation is idempotent on the same confirmation id and refused on a different one.
- Executing remains Phase 3+ work and needs its own task, review and gate. This ADR records a scoped exception, not a phase promotion: the roadmap order is unchanged.

## Target component contracts

```text
Web Widget / LINE OA
  -> signed/trusted channel boundary
  -> tenant workspace resolver (server-side)
  -> durable session + event dedupe + operator state
  -> source-scoped RAG search + business data ports
  -> policy + answerability + model gateway
  -> reply OR staff handoff
  -> audit / usage meter / cost budget
```

## Current demonstrated scope

- **Implemented + unit-testable only:** shared channel contracts (`InboundMessage`, `TrustedWorkspaceContext`, `ChannelPort`, normalized `ChannelError`); a minimal trusted workspace context implementation under `platform/modules/tenancy/` with a compatibility export; HMAC signature verification, canonical LINE destination validation for signed events, bounded signed LINE text-event normalization (lookup injected), no-event URL-probe acknowledgement, LINE text reply transport, a durable event-processing lease port, simple candidate-source filter.
- **Security boundary:** LINE destination is untrusted until signature verification and is used only to look up a server-owned connection. Accepted user events require bounded, validated IDs, timestamps and text. Unsupported event types and non-user/non-text messages are ignored.
- **URL-probe boundary:** the documented unsigned connectivity probe is acknowledged only for an exact, bounded envelope with `events: []`; it creates no workspace context, performs no connection lookup and emits no events. Signed Console verification still uses the canonical destination and raw-body HMAC path.
- **Durability boundary:** `LineEventDeduplicator` defines atomic lease claim, completion, retry release and expiry semantics scoped by workspace, connection and webhook event ID. The port and in-memory test double do not provide durable storage or prove distributed deduplication; that remains NOT IMPLEMENTED.
- **Knowledge boundary:** G1a implements provider-neutral source/version/chunk/retrieval contracts and FAQ lifecycle behavior; G1b adds bounded local Node PDF/CSV text extraction with page/row citations and draft preparation; G1c adds a 30-query synthetic lexical baseline; G1-C1 adds punctuation-insensitive SKU matching only when the approved workspace corpus has a unique compact form. G1-007A adds a PostgreSQL knowledge repository with RLS, atomic approved-version uniqueness, and PGlite integration tests; this is local SQL evidence, not hosted-database or authenticated-upload proof. The latest G1-C evaluation remains synthetic/in-memory and does not evaluate generated-answer grounding or set a release threshold; policy abstention is unmeasured, and contradictory sources have no authority resolution or safe handoff. Authenticated upload, private original-file storage, hosted DB wiring, pgvector, production authorization, evaluated answerability policy and production retrieval remain NOT IMPLEMENTED. Approved excerpts remain untrusted data. Details and limits are in `reports/G1C-THAI-RETRIEVAL-BASELINE-2026-10-15.md`, `reports/G1C1-SKU-PUNCTUATION-2026-10-16.md`, and the Task 007A report.
- **Conversation/handoff boundary:** G1d adds a local state machine and repository/authorization ports: handoff pauses AI; only an authorized staff operation releases it. The in-memory test adapter is not durable proof, and no channel send path currently enforces this state atomically; live handoff is NOT IMPLEMENTED.
- **Response orchestration boundary:** Task 006B adds a provider-neutral retrieval → answerability → generation → citation validation or handoff core. Task 006C adds a mocked-transport OpenAI-compatible answerability/generation adapter that requires a host-provided token-usage sink and fails closed on malformed output. No live provider selection, durable usage ledger, dollar-cost/spend control, evaluated semantic answer, durable escalation or channel delivery is demonstrated.
- **NOT implemented:** authenticated PDF/CSV upload, HTTP server, durable storage/async work, real LINE API E2E, embeddings, live model/provider, Web UI, operator Inbox, production authorization, SaaS billing or workspace management.
- The candidate-source filter does **not** check semantic relevance or factual sufficiency. Do not call it a complete Answerability Gate.
