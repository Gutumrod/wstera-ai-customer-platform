# Phase Breakdown — Roadmap Branches and Change-Control Plan

**Owner goal:** two products (Web Chat + LINE OA) one Shared AI Engine, self-service business SaaS, revenue over code volume. Detailed locks in `../BRIEF.md`.

## Phase 0 — Foundation and reusable boundaries

**0A (Task 001 / PR #2 open):** Harden signed LINE boundary and tests, verify live-protocol assumptions, event claim/recovery contract. Independent review flagged M1/M2; no merge until resolved or owner explicitly accepts risk.
**0B (this docs PR):** Locked master brief, folder responsibilities, port/adapters contracts, phased delivery. No production code moves.
**0C (after 0A/0B):** Incremental module-boundary refactor from `platform/src/` to target directories, maintain same behavior + tests; verify imports, port typing and no duplicate engines.

Gate G0: clean CI, source provenance, branch/PR review, explicit security boundary.

## Phase 1 — One-workspace Web + RAG MVP

1A. **Workspace & source contracts:** trusted workspace, staff role, documents metadata/version/approval, data retention, API/DB isolation.
1B. **Synthetic fixtures + ingestion:** FAQ text first; PDF/CSV next; private upload and extraction, asynchronous if necessary, re-index/delete.
1C. **Retrieval:** pgvector + lexical/SKU baseline, Thai evaluation corpus, source citation mapping, conflicting/revoked content, negative injection fixtures.
1D. **Shared response path:** explicit provider adapter, evidence/answerability policy, retry/error/cost bounds and fallback to human.
1E. **Web Chat UI:** iframe-loader or equivalent validated, assistant-ui-based chat and owner QA, responsive Thai UX, minimal operator escalation.
1F. **Integration Gate:** upload -> retrieve -> cited chat -> handoff and staff response on ONE controlled workspace; cross-tenant negative cases; measure latency and spend.

Gate G1: real product trace and review, not screenshots or mocks; owner demo before widening feature set.

## Phase 2 — LINE OA controlled pilot

2A. Guided merchant setup, connection secret management and webhook ownership conflict warning.
2B. LINE adapter and host: raw signature verification, verification probe behavior, event normalization, idempotent durable queue/lease/replay.
2C. Timing & delivery: reply-token expiration, fallback messaging policy, rate/quotas, failures and monitoring.
2D. Handoff integration: staff takeover, AI pause, recovery/resume, OA Manager versus built-in Inbox test.
2E. One real LINE OA sandbox roundtrip proof incl. duplicate deliveries, unsupported events, multi-channel same tenant.

Gate G2: actual vendor E2E evidence and human handoff — no 'works in mock' claims.

## Phase 3 — Multi-workspace self-service SaaS

3A. Merchant onboarding, RBAC and RLS enforced at DB/API/retrieval/logs.
3B. Shop knowledge lifecycle, isolated workspace settings, connection change/rotation/revoke.
3C. Usage metering, allowance ceilings, provider budget controls, abuse limits.
3D. Operations/admin: staff roles, SLA/outage reporting, backups and deletion workflows.
3E. Second shop self-onboards in separate tenant; automated cross-tenant attack tests.

Gate G3: negative tenant tests, retention/deletion, resilience and rollback proven.

## Phase 4 — Commercial validation

4A. Tier/pricing experiment, onboarding funnel and paid pilot willingness-to-pay.
4B. Billing/payment/refund rules and legal/PDPA review with owner approval.
4C. Cost-per-shop/per-conversation and sustained load, incident response, support SOP.
4D. Launch decision from real paid use and margins, not model output.

Gate G4: owner decides to sell; no paid infrastructure assumed up front.

## Codex implementation rhythm

For every numbered branch: create scoped Issue + task brief -> agree port/contract and acceptance criteria -> implement on branch -> tests + security diff -> independent reviewer gate -> owner merge -> update architecture + source docs. A later phase never unlocks just because earlier source files exist; evidence matters.

**Dependency rule:** Phase 1 must not import a LINE-specific adapter into the core. Phase 2 must call the same core used by Web Chat. Phase 3 expands multi-tenant onboarding, but tenant-safe boundaries are present from Phase 1.
