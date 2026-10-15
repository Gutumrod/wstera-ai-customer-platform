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
- **Knowledge boundary:** G1a now implements provider-neutral source/version/chunk/retrieval contracts and pure FAQ state/chunking/lexical behavior under `platform/modules/knowledge/`; approved content is immutable and retrieval is tenant-scoped. The lexical baseline is synthetic and not evaluated Thai semantic evidence. PDF/CSV parsing, persistent storage, pgvector, authentication/RLS, model policy/generation and production retrieval remain NOT IMPLEMENTED. Approved excerpts remain untrusted data.
- **NOT implemented:** HTTP server, durable storage, real LINE API E2E, pdf upload, embeddings, answer model, Web UI, operator Inbox, SaaS billing or workspace management.
- The candidate-source filter does **not** check semantic relevance or factual sufficiency. Do not call it a complete Answerability Gate.
