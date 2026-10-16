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
- **Knowledge boundary:** G1a implements provider-neutral source/version/chunk/retrieval contracts and FAQ lifecycle behavior; G1b adds bounded local Node PDF/CSV text extraction with page/row citations and draft preparation; G1c adds a 30-query synthetic lexical baseline. The latest local in-memory run reports recall@3 0.963, precision@3 0.333, citation precision 1.0, retrieval abstention accuracy 1.0 (2/2), and local latency P50/P95 0.181/0.624 ms. This does not evaluate generated-answer grounding or establish a release threshold; policy abstention is unmeasured, and contradictory sources are both retrieved without authority resolution or safe handoff. Authenticated upload, persistent storage, pgvector, production authentication/RLS, model policy/generation and production retrieval remain NOT IMPLEMENTED. Approved excerpts remain untrusted data. Details and limits are in `reports/G1C-THAI-RETRIEVAL-BASELINE-2026-10-15.md`.
- **Conversation/handoff boundary:** G1d adds a local state machine and repository/authorization ports: handoff pauses AI; only an authorized staff operation releases it. The in-memory test adapter is not durable proof, and no channel send path currently enforces this state atomically; live handoff is NOT IMPLEMENTED.
- **NOT implemented:** authenticated PDF/CSV upload, HTTP server, durable storage/async work, real LINE API E2E, embeddings, answer model, Web UI, operator Inbox, production authorization, SaaS billing or workspace management.
- The candidate-source filter does **not** check semantic relevance or factual sufficiency. Do not call it a complete Answerability Gate.
